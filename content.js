(function() {
    const documentPathPattern = /^\/[a-z]{2}\/doc\/[^/]+(?:\/|$)/i;
    const buttonId = 'studydrive-downloader-button';
    const newButton = createButton();
    const entryButtons = new Map();
    const pendingDownloads = new Map();
    let notice;
    let noticeTimeout;

    function getDocumentUrl(value) {
        try {
            const url = new URL(value, window.location.href);
            if (url.origin !== 'https://www.studydrive.net'
                || !documentPathPattern.test(url.pathname)) {
                return null;
            }
            url.search = '';
            url.hash = '';
            return url.href;
        } catch (error) {
            return null;
        }
    }

    function syncButton() {
        if (!documentPathPattern.test(window.location.pathname)) {
            newButton.remove();
            return;
        }

        // StudyDrive can navigate and rebuild the page without a full reload.
        if (document.body && !newButton.isConnected) {
            document.body.appendChild(newButton);
        }
        newButton.disabled = pendingDownloads.has(getDocumentUrl(window.location.href));
    }

    function syncEntryButtons() {
        for (const [card, button] of entryButtons) {
            if (!card.isConnected || !getDocumentUrl(card.href)) {
                button.remove();
                entryButtons.delete(card);
            }
        }

        for (const card of document.querySelectorAll('a[data-testid="card-item"][href], a.card[href]')) {
            if (!getDocumentUrl(card.href)) {
                continue;
            }

            let button = entryButtons.get(card);
            if (!button) {
                button = createEntryButton(card);
                entryButtons.set(card, button);
            }
            if (button.parentElement !== card) {
                card.appendChild(button);
            }
        }
    }

    function createEntryButton(card) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'studydrive-downloader-entry';
        button.title = 'Dokument herunterladen';
        button.setAttribute('aria-label', 'Dokument herunterladen');

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const downloadIcon = 'M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4';
        icon.setAttribute('d', downloadIcon);
        svg.appendChild(icon);
        button.appendChild(svg);

        // The card itself is a link. Keep pointer and keyboard activation on
        // the download control from triggering the card's navigation handlers.
        button.addEventListener('pointerdown', event => event.stopPropagation());
        button.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.stopPropagation();
            }
        });
        button.addEventListener('click', async function(event) {
            event.preventDefault();
            event.stopPropagation();
            button.disabled = true;
            button.dataset.state = 'busy';
            button.title = 'Download wird vorbereitet…';
            button.setAttribute('aria-label', button.title);
            icon.setAttribute('d', 'M20 12a8 8 0 1 1-8-8');
            try {
                // Read href at click time: the site may reuse a card after
                // sorting/filtering rather than create a new DOM element.
                const fileName = await downloadDocument(card.href);
                button.dataset.state = 'success';
                button.title = 'Download gestartet: ' + fileName;
                icon.setAttribute('d', 'm5 12 4 4L19 6');
            } catch (error) {
                button.dataset.state = 'error';
                button.title = error.message;
                icon.setAttribute('d', 'M12 4v10m0 4v2');
                showDownloadError(error.message);
            } finally {
                button.disabled = false;
                button.setAttribute('aria-label', button.title);
                window.setTimeout(() => {
                    if (!button.disabled) {
                        delete button.dataset.state;
                        button.title = 'Dokument herunterladen';
                        button.setAttribute('aria-label', button.title);
                        icon.setAttribute('d', downloadIcon);
                    }
                }, 3000);
            }
        });
        return button;
    }

    function showDownloadError(message) {
        if (!notice) {
            notice = document.createElement('div');
            notice.className = 'studydrive-downloader-notice';
            notice.setAttribute('role', 'alert');
        }
        notice.textContent = message;
        if (document.body && !notice.isConnected) {
            document.body.appendChild(notice);
        }
        window.clearTimeout(noticeTimeout);
        noticeTimeout = window.setTimeout(() => notice.remove(), 7000);
    }

    function createButton() {
        const button = document.createElement('button');
        button.id = buttonId;
        button.type = 'button';
        button.className = 'studydrive-downloader-button';
        button.style.backgroundColor = 'green';
        button.style.color = 'white';
        button.style.padding = '15px';
        button.style.border = 'none';
        button.style.cursor = 'pointer';
        button.style.position = 'fixed';
        button.style.bottom = '20px';
        button.style.right = '20px';
        button.style.zIndex = '2147483647';
        button.style.transition = 'transform 0.3s ease-in-out';

        const buttonText = document.createElement('span');
        buttonText.textContent = 'Download Document';
        button.appendChild(buttonText);

        return button;
    }

    newButton.addEventListener('mouseenter', function() {
        newButton.style.transform = 'scale(1.1)';
    });

    newButton.addEventListener('mouseleave', function() {
        newButton.style.transform = 'scale(1)';
    });

    newButton.addEventListener('click', async function() {
        try {
            await downloadDocument();
        } catch (error) {
            console.error('[StudyDrive Download]', error);
            showDownloadError(error.message);
        }
    });

    async function downloadDocument(value = window.location.href) {
        const documentUrl = getDocumentUrl(value);
        if (!documentUrl) {
            throw new Error('Bitte öffne ein Dokument auf StudyDrive.');
        }
        if (pendingDownloads.has(documentUrl)) {
            return pendingDownloads.get(documentUrl);
        }

        const download = fetchDocument(documentUrl);
        pendingDownloads.set(documentUrl, download);
        syncButton();
        try {
            return await download;
        } finally {
            pendingDownloads.delete(documentUrl);
            syncButton();
        }
    }

    async function fetchDocument(documentUrl) {
        const result = await fetch(documentUrl);
        if (!result.ok) {
            throw new Error('Die Dokumentseite konnte nicht geladen werden.');
        }
        const html = await result.text();

        const parsedLink = getDownloadLink(html);
        if (!parsedLink) {
            throw new Error('Für dieses Dokument wurde kein Download-Link gefunden.');
        }

        const fileName = getFileName(html);
        if (!fileName) {
            throw new Error('Dieses Dateiformat wird nicht unterstützt.');
        }

        const downloadResult = await fetch(parsedLink);
        if (!downloadResult.ok) {
            throw new Error('Das Dokument konnte nicht heruntergeladen werden.');
        }
        const blob = await downloadResult.blob();
        downloadFile(blob, fileName);
        return fileName;
    }

    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
        if (sender.id !== chrome.runtime.id || message?.action !== 'download-document') {
            return;
        }

        downloadDocument().then(
            fileName => sendResponse({ success: true, fileName }),
            error => sendResponse({ success: false, error: error.message })
        );
        return true;
    });

    function getDownloadLink(html) {
        const linkMatch = /"file_preview":("[^"]*")/.exec(html);
        if (!linkMatch) {
            return null;
        }
        return JSON.parse(linkMatch[1]);
    }

    function getFileName(html) {
        const fileNameMatch = /"filename":("[^"]*")/.exec(html);
        if (!fileNameMatch) {
            return "preview.pdf";
        }
        let fileName = JSON.parse(fileNameMatch[1]).trim();

        // this removes file extension docx and adds pdf file extension.
        if (/\.docx$/i.test(fileName)) {
            fileName = fileName.slice(0, -5) + '.pdf';
        }

        // this is to ensure only pdfs are downloaded.
        if (!/\.pdf$/i.test(fileName)) {
            return null;
        }

        return fileName;
    }

    function downloadFile(blob, fileName) {
        var link = document.createElement('a');
        link.download = fileName;
        link.href = window.URL.createObjectURL(blob);
        link.target = "_blank";
        link.click();
    }

    function syncControls() {
        syncButton();
        syncEntryButtons();
    }

    window.addEventListener('popstate', syncControls);
    window.addEventListener('hashchange', syncControls);

    // Check both SPA navigation and removed buttons on a timer. Never reinsert
    // from a MutationObserver: if the site removes our button in its own
    // observer, the observers can otherwise block rendering in an endless loop.
    // pushState/replaceState also do not emit popstate in this content script.
    window.setInterval(syncControls, 1000);
    syncControls();
})();
