document.addEventListener('DOMContentLoaded', async function() {
    // Also handle older popup markup while the extension is being updated.
    const downloadButton = document.getElementById('downloadButton')
        || document.getElementById('externalButton')
        || document.createElement('button');
    downloadButton.id = 'downloadButton';
    downloadButton.type = 'button';
    downloadButton.textContent = 'Herunterladen';
    downloadButton.disabled = true;
    if (!downloadButton.isConnected) {
        document.body.appendChild(downloadButton);
    }

    const status = document.getElementById('status') || document.createElement('p');
    status.id = 'status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    if (!status.isConnected) {
        downloadButton.before(status);
    }
    function isDocumentUrl(value) {
        try {
            const url = new URL(value);
            const [, language, page, documentName] = url.pathname.split('/');
            return url.origin === 'https://www.studydrive.net'
                && /^[a-z]{2}$/i.test(language || '')
                && (page || '').toLowerCase() === 'doc'
                && Boolean(documentName);
        } catch (error) {
            return false;
        }
    }


    async function getDocumentTab() {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return tab?.id != null && isDocumentUrl(tab.url) ? tab : null;
    }

    downloadButton.addEventListener('click', async function() {
        downloadButton.disabled = true;
        downloadButton.textContent = 'Wird vorbereitet…';
        status.textContent = 'Download wird vorbereitet…';

        try {
            const tab = await getDocumentTab();
            if (!tab) {
                status.textContent = 'Bitte öffne ein Dokument auf StudyDrive.';
                return;
            }

            const response = await chrome.tabs.sendMessage(tab.id, {
                action: 'download-document'
            });
            status.textContent = response?.success
                ? 'Download gestartet: ' + response.fileName
                : response?.error || 'Der Download konnte nicht gestartet werden.';
        } catch (error) {
            status.textContent = 'Bitte lade die StudyDrive-Seite neu und versuche es erneut.';
        } finally {
            downloadButton.textContent = 'Herunterladen';
            try {
                downloadButton.disabled = !(await getDocumentTab());
            } catch (error) {
                downloadButton.disabled = true;
            }
        }
    });

    try {
        if (await getDocumentTab()) {
            downloadButton.disabled = false;
            status.textContent = 'Lade das geöffnete Dokument als PDF herunter.';
        } else {
            status.textContent = 'Bitte öffne ein Dokument auf StudyDrive.';
        }
    } catch (error) {
        status.textContent = 'Der aktuelle Tab konnte nicht erkannt werden.';
    }
});
