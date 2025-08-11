// --- Importy wymaganych modułów ---
const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const xlsx = require('xlsx');
const multer = require('multer');
const JSZip = require('jszip');
require('dotenv').config();

// --- Inicjalizacja aplikacji Express ---
const app = express();
const port = process.env.PORT || 3002;

// --- Konfiguracja middleware ---
app.use(express.json()); // Do parsowania ciała żądań w formacie JSON
app.use(express.urlencoded({ extended: true })); // Do parsowania danych z formularzy
app.use(express.static(path.join(__dirname, 'public'))); // Do serwowania plików statycznych (HTML, CSS, JS)

// Konfiguracja multer do przechowywania wgranego pliku w pamięci serwera
const upload = multer({ storage: multer.memoryStorage() });

// --- Stałe konfiguracyjne API ---
const API_BASE_URL = 'https://api.system.netsalesmedia.pl';
const API_ENDPOINTS = {
    LIST_SETS: `${API_BASE_URL}/creatives/creativeset/list`,
    GET_SINGLE_SET: `${API_BASE_URL}/creatives/creativeset/single`,
    CREATE_SET: `${API_BASE_URL}/creatives/creativeset/create`,
    CREATE_DISPLAY_CREATIVE: `${API_BASE_URL}/creatives/creative/image/createHosted`,
    GET_USER_INFO: `${API_BASE_URL}/access/user/get`
};

// --- Scentralizowana instancja Axios z interceptorem błędów ---
const apiClient = axios.create();

// Interceptor "przechwytuje" odpowiedzi z API w celu ujednoliconej obsługi błędów
apiClient.interceptors.response.use(
    response => response, // Jeśli odpowiedź jest poprawna, po prostu ją zwróć
    error => {
        // Jeśli wystąpił błąd autoryzacji (nieprawidłowy klucz lub brak uprawnień)
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
            // Rzuć specyficzny błąd, który zostanie złapany w bloku catch wyższego rzędu
            return Promise.reject(new Error("unauthorized"));
        }
        // Dla wszystkich innych błędów, przekaż je dalej
        return Promise.reject(error);
    }
);


// --- Funkcje pomocnicze komunikujące się z API ---

/**
 * Wyszukuje ID folderu "Display" dla danego reklamodawcy.
 * @param {string} advertiserId - ID reklamodawcy.
 * @param {string} apiKey - Klucz API użytkownika.
 * @returns {Promise<string|null>} ID folderu lub null, jeśli nie znaleziono.
 */
async function findDisplayFolderId(advertiserId, apiKey) {
    const config = { headers: { 'x-api-key': apiKey }, params: { advertiserId } };
    const response = await apiClient.get(API_ENDPOINTS.LIST_SETS, config);
    if (response.data && Array.isArray(response.data)) {
        const searchPattern = /display/i;
        const displayFolder = response.data.find(set => searchPattern.test(set.name));
        return displayFolder ? displayFolder.creativeSetId : null;
    }
    return null;
}

/**
 * Znajduje najwyższy numer porządkowy wśród podfolderów w folderze "Display".
 * @param {string} parentCreativeSetId - ID nadrzędnego folderu "Display".
 * @param {string} advertiserId - ID reklamodawcy.
 * @param {string} apiKey - Klucz API użytkownika.
 * @returns {Promise<number>} Najwyższy znaleziony numer lub 0.
 */
async function findHighestCreativeNumber(parentCreativeSetId, advertiserId, apiKey) {
    const config = { headers: { 'x-api-key': apiKey }, params: { creativeSetId: parentCreativeSetId, advertiserId } };
    const response = await apiClient.get(API_ENDPOINTS.LIST_SETS, config);
    if (response.data && Array.isArray(response.data)) {
        let highestNumber = 0;
        response.data.forEach(set => {
            const match = set.name.match(/^(\d+)/); // Szukamy folderów, których nazwa zaczyna się od cyfr
            if (match) {
                const number = parseInt(match[1], 10);
                if (number > highestNumber) { highestNumber = number; }
            }
        });
        return highestNumber;
    }
    return 0;
}

/**
 * Pobiera ID kategorii produktu z istniejącego zestawu kreacji (folderu).
 * @param {string} creativeSetId - ID folderu kreacji.
 * @param {string} apiKey - Klucz API użytkownika.
 * @returns {Promise<string|null>} ID kategorii produktu lub null.
 */
async function getProductCategoryIdFromSet(creativeSetId, apiKey) {
    const config = { headers: { 'x-api-key': apiKey }, params: { creativeSetId } };
    const response = await apiClient.get(API_ENDPOINTS.GET_SINGLE_SET, config);
    return response.data?.productCategoryId || null;
}

/**
 * Tworzy nowy podfolder dla kreacji w folderze "Display".
 * @param {string} advertiserId - ID reklamodawcy.
 * @param {string} parentCreativeSetId - ID folderu nadrzędnego ("Display").
 * @param {string} folderName - Nazwa nowego podfolderu.
 * @param {string} defaultTargetUrl - Domyślny URL docelowy.
 * @param {string} productCategoryId - ID kategorii produktu.
 * @param {string} apiKey - Klucz API użytkownika.
 * @returns {Promise<string|null>} ID nowo utworzonego folderu lub null.
 */
async function createNewSubfolder(advertiserId, parentCreativeSetId, folderName, defaultTargetUrl, productCategoryId, apiKey) {
    const requestBody = {
        commandId: uuidv4(), creativeSetId: uuidv4(), advertiserId: advertiserId,
        parentCreativeSetId: parentCreativeSetId, name: folderName, defaultTargetURL: defaultTargetUrl,
        productCategoryId: productCategoryId,
    };
    const config = { headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' } };
    const response = await apiClient.post(API_ENDPOINTS.CREATE_SET, requestBody, config);
    if (response.data?.errors) { return null; }
    return requestBody.creativeSetId;
}

/**
 * Tworzy nową kreację display (obrazkową) w określonym folderze.
 * @param {object} creativeData - Dane kreacji.
 * @param {string} base64Image - Obraz zakodowany w Base64.
 * @param {string} apiKey - Klucz API użytkownika.
 * @returns {Promise<object|null>} Obiekt z wynikiem operacji lub null w przypadku błędu.
 */
async function createDisplayCreative(creativeData, base64Image, apiKey) {
    const requestBody = {
        commandId: uuidv4(), creativeId: uuidv4(), creativeSetId: creativeData.creativeSetId,
        name: creativeData.creativeName, base64: base64Image,
        presentation: { altTag: creativeData.creativeName },
        targetUrl: creativeData.targetUrl, status: 'ACTIVE',
    };
    const config = { headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' } };
    const response = await apiClient.post(API_ENDPOINTS.CREATE_DISPLAY_CREATIVE, requestBody, config);
    if (response.data?.errors) { return null; }
    return response.data;
}

/**
 * Główna funkcja orkiestrująca cały proces tworzenia kreacji dla pojedynczego rekordu.
 * @param {object} record - Pojedynczy wiersz z pliku XLSX.
 * @param {string} apiKey - Klucz API użytkownika.
 * @returns {Promise<object>} Obiekt z informacją o sukcesie lub porażce.
 */
async function runAutomation(record, apiKey) {
    const { advertiserId, creativeName, campaignPeriod, targetUrl, displays } = record;

    try {
        // Krok 1: Walidacja danych wejściowych i przygotowanie URL-a
        if (!displays || !displays.startsWith('http')) {
            return { success: false, message: `Kreacja "${creativeName}" nie została utworzona. Niepoprawny URL pliku ZIP: "${displays}".` };
        }

        let finalTargetUrl = targetUrl;
        if (advertiserId === '76829') { // Automatyczne dodawanie parametrów UTM dla klienta
            const urlSeparator = targetUrl.includes('?') ? '&' : '?';
            const urlParams = `${urlSeparator}utm_source=pp&utm_medium=cps&utm_campaign=SalesMedia&utm_content=#{PARTNER_ID}`;
            finalTargetUrl = `${targetUrl}${urlParams}`;
        }
    
        // Krok 2: Znalezienie nadrzędnego folderu "Display" i pobranie z niego ID kategorii produktu
        const parentFolderId = await findDisplayFolderId(advertiserId, apiKey);
        if (!parentFolderId) {
            return { success: false, message: `Kreacja "${creativeName}" nie została utworzona. Nie znaleziono folderu 'Display' dla reklamodawcy o ID ${advertiserId}.` };
        }
        
        const productCategoryId = await getProductCategoryIdFromSet(parentFolderId, apiKey);
        if (!productCategoryId) {
            return { success: false, message: `Kreacja "${creativeName}" nie została utworzona. Nie udało się pobrać ID kategorii produktu z folderu 'Display'.` };
        }
    
        // Krok 3: Określenie nazwy nowego podfolderu na podstawie najwyższego istniejącego numeru
        const highestNumber = await findHighestCreativeNumber(parentFolderId, advertiserId, apiKey);
        const newCreativeNumber = highestNumber + 1;
        const newCreativeFolderName = campaignPeriod ? `${newCreativeNumber} - ${creativeName} - ${campaignPeriod}` : `${newCreativeNumber} - ${creativeName}`;
    
        // Krok 4: Pobranie i rozpakowanie plików z archiwum ZIP
        let zipFileContent;
        try {
            const zipResponse = await axios.get(displays, { responseType: 'arraybuffer' });
            zipFileContent = zipResponse.data;
        } catch (error) {
            return { success: false, message: `Kreacja "${creativeName}" nie została utworzona. Błąd podczas pobierania pliku ZIP: ${error.message}` };
        }
        const zip = await JSZip.loadAsync(zipFileContent);

        // Krok 5: Utworzenie nowego podfolderu w systemie
        const newFolderId = await createNewSubfolder(advertiserId, parentFolderId, newCreativeFolderName, finalTargetUrl, productCategoryId, apiKey);
        if (!newFolderId) {
            return { success: false, message: `Kreacja "${creativeName}" nie została utworzona. Nie udało się utworzyć podfolderu.` };
        }

        // Krok 6: Przetwarzanie każdego pliku z ZIP i tworzenie kreacji
        const successfulCreations = [];
        const errors = [];
        const maxFileSize = 250 * 1024; // Limit rozmiaru pliku: 250 KB

        for (const fileName in zip.files) {
            if (zip.files[fileName].dir || path.extname(fileName).toLowerCase() === '.zip') {
                continue; // Pomiń foldery i pliki .zip wewnątrz archiwum
            }

            try {
                const file = zip.files[fileName];
                const fileData = await file.async("uint8array");

                if (fileData.length > maxFileSize) {
                    errors.push({ fileName, error: `Rozmiar pliku "${fileName}" (${Math.round(fileData.length / 1024)} KB) przekracza dopuszczalny limit 250 KB.` });
                    continue;
                }

                const mimeType = path.extname(fileName).toLowerCase().substring(1);
                const base64Data = Buffer.from(fileData).toString('base64');
                const base64Image = `data:image/${mimeType};base64,${base64Data}`;
    
                const creativeData = { creativeName: fileName, creativeSetId: newFolderId, targetUrl: finalTargetUrl };
                const creationResult = await createDisplayCreative(creativeData, base64Image, apiKey);

                if (creationResult) {
                    successfulCreations.push(fileName);
                } else {
                    errors.push({ fileName, error: `Błąd podczas tworzenia pliku "${fileName}" w API.` });
                }
            } catch (e) {
                errors.push({ fileName, error: `Wystąpił błąd podczas przetwarzania pliku "${fileName}": ${e.message}` });
            }
        }
        
        // Krok 7: Generowanie finalnego komunikatu podsumowującego
        let finalMessage = '';
        if (successfulCreations.length > 0) {
            const creativeNameWithPrefix = `Display - ${newCreativeFolderName}`;
             finalMessage += `Utworzono kreację "${creativeNameWithPrefix}". Pliki: ${successfulCreations.join(', ')}.`;
        }
        if (errors.length > 0) {
            const errorMessages = errors.map(e => `❌ ${e.error}`);
            finalMessage += (finalMessage ? '\n' : '') + errorMessages.join('\n');
        }
        
        return { success: successfulCreations.length > 0, message: finalMessage.trim() };

    } catch (error) {
        // Centralna obsługa błędów dla całego procesu automatyzacji
        if (error.message === "unauthorized") {
            return { success: false, message: `Błąd dla kreacji "${creativeName}": Nieprawidłowy API Key, lub brak uprawnień.` };
        }
        return { success: false, message: `Wystąpił nieoczekiwany błąd podczas automatyzacji dla kreacji "${creativeName}": ${error.message}` };
    }
}


// --- Endpointy API serwera Express ---

// Endpoint do weryfikacji klucza API
app.post('/verify-api-key-display', async (req, res) => {
    const { apiKey } = req.body;
    if (!apiKey) {
        return res.status(400).json({ success: false, message: 'Błąd: Brakuje klucza API.' });
    }

    try {
        const config = { headers: { 'x-api-key': apiKey } };
        await apiClient.get(API_ENDPOINTS.GET_USER_INFO, config);
        res.status(200).json({ success: true, message: 'Klucz API zweryfikowany pomyślnie!' });
    } catch (error) {
        console.error('Błąd podczas weryfikacji klucza:', error.message);
        res.status(401).json({ success: false, message: 'Nieprawidłowy klucz API lub brak uprawnień.' });
    }
});

// Endpoint do wgrywania pliku XLSX i uruchamiania procesu
app.post('/upload-display', upload.single('xlsxFile'), async (req, res) => {
    const { apiKey } = req.body;
    const file = req.file;

    if (!apiKey || !file) {
        return res.status(400).json({ success: false, message: 'Błąd: Brakuje klucza API lub pliku.' });
    }
    
    try {
        const workbook = xlsx.read(file.buffer, { type: 'buffer' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const records = xlsx.utils.sheet_to_json(worksheet);

        if (records.length === 0) {
            return res.status(400).json({ success: false, message: 'Błąd: Plik Excel jest pusty lub nie zawiera poprawnych nagłówków.' });
        }
        
        const results = [];
        // Iteracja przez każdy wiersz z pliku i uruchomienie dla niego automatyzacji
        for (const record of records) {
            const requiredFields = ['advertiserId', 'creativeName', 'targetUrl', 'displays'];
            const missingFields = requiredFields.filter(field => !record[field]);
            
            if (missingFields.length > 0) {
                const creativeName = record.creativeName || 'Brak nazwy';
                results.push({
                    success: false,
                    message: `Kreacja "${creativeName}" nie została utworzona. Brakuje wymaganych kolumn: ${missingFields.join(', ')}.`
                });
                continue;
            }

            const result = await runAutomation({
                advertiserId: String(record.advertiserId),
                creativeName: String(record.creativeName),
                campaignPeriod: record.campaignPeriod ? String(record.campaignPeriod) : null,
                targetUrl: String(record.targetUrl),
                displays: String(record.displays)
            }, apiKey);
            results.push(result);
        }
        res.status(200).json({ success: true, message: 'Przetwarzanie zakończone. Poniżej lista statusów utworzonych kreacji.', results });
    } catch (error) {
        console.error('Błąd podczas przetwarzania pliku:', error);
        res.status(500).json({ success: false, message: 'Wystąpił błąd podczas przetwarzania pliku.' });
    }
});

// Endpoint główny, serwujący plik index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Uruchomienie serwera ---
app.listen(port, () => {
    console.log(`Kreator-display-automatyczny nasłuchuje na porcie ${port}`);
    console.log(`Otwórz http://localhost:${port}/ w swojej przeglądarce.`);
});