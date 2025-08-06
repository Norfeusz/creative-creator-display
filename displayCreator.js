// displayCreator.js

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const JSZip = require('jszip');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid'); // Dodano brakujący import
require('dotenv').config();

// --- Konfiguracja i stałe ---
const API_KEY = process.env.API_KEY; 
const API_BASE_URL = 'https://api.system.netsalesmedia.pl';

const DISPLAY_FOLDER_NAME = 'Display';

// --- Adresy URL endpointów API ---
const API_URL_LIST_SETS = `${API_BASE_URL}/creatives/creativeset/list`;
const API_URL_GET_SINGLE_SET = `${API_BASE_URL}/creatives/creativeset/single`;
const API_URL_CREATE_SET = `${API_BASE_URL}/creatives/creativeset/create`;
const API_URL_CREATE_DISPLAY_CREATIVE = `${API_BASE_URL}/creatives/creative/image/createHosted`;

// --- Funkcja do szukania folderu 'Display' ---
async function findDisplayFolderId(advertiserId) {
    try {
        const searchPattern = /display/i;
        const config = {
            headers: { 'x-api-key': API_KEY },
            params: { advertiserId: advertiserId }
        };
        const response = await axios.get(API_URL_LIST_SETS, config);
        if (response.data && Array.isArray(response.data)) {
            const displayFolder = response.data.find(set => searchPattern.test(set.name));
            if (displayFolder) {
                console.log(`Znaleziono folder "${displayFolder.name}" z ID: ${displayFolder.creativeSetId}`);
                return displayFolder.creativeSetId;
            }
            console.error(`Nie znaleziono folderu zawierającego "display" dla podanego reklamodawcy.`);
            return null;
        }
        return null;
    } catch (error) {
        console.error('Błąd podczas wyszukiwania folderu display:', error.message);
        if (error.response) console.error('Szczegóły błędu:', error.response.data);
        return null;
    }
}

// --- Funkcja do znajdowania najwyższej liczby w nazwach folderów ---
async function findHighestCreativeNumber(parentCreativeSetId, advertiserId) {
    try {
        const config = {
            headers: { 'x-api-key': API_KEY },
            params: {
                creativeSetId: parentCreativeSetId,
                advertiserId: advertiserId
            }
        };
        const response = await axios.get(API_URL_LIST_SETS, config);
        if (response.data && Array.isArray(response.data)) {
            let highestNumber = 0;
            response.data.forEach(set => {
                const match = set.name.match(/^(\d+)/);
                if (match) {
                    const number = parseInt(match[1], 10);
                    if (number > highestNumber) {
                        highestNumber = number;
                    }
                }
            });
            console.log(`Najwyższy znaleziony numer folderu to: ${highestNumber}`);
            return highestNumber;
        } else {
            console.log('Nie znaleziono żadnych podfolderów, rozpoczynam od 0.');
            return 0;
        }
    } catch (error) {
        console.error('Błąd podczas pobierania podfolderów:', error.message);
        if (error.response) console.error('Szczegóły błędu:', error.response.data);
        return 0;
    }
}

// --- Funkcja do pobierania ID kategorii produktu z folderu ---
async function getProductCategoryIdFromSet(creativeSetId) {
    try {
        const config = {
            headers: { 'x-api-key': API_KEY },
            params: { creativeSetId: creativeSetId }
        };
        const response = await axios.get(API_URL_GET_SINGLE_SET, config);
        if (response.status !== 200) {
            console.error(`Błąd: Otrzymano status ${response.status}`);
            return null;
        }
        if (response.data && response.data.productCategoryId) {
            console.log(`Znaleziono productCategoryId: ${response.data.productCategoryId}`);
            return response.data.productCategoryId;
        } else {
            console.error('Nie udało się pobrać productCategoryId z danego creative set.');
            return null;
        }
    } catch (error) {
        console.error('Błąd podczas pobierania kategorii produktu:', error.message);
        if (error.response) console.error('Szczegóły błędu:', error.response.data);
        return null;
    }
}

// --- Funkcja do tworzenia nowego podfolderu ---
async function createNewSubfolder(advertiserId, parentCreativeSetId, folderName, defaultTargetUrl, productCategoryId) {
    try {
        const requestBody = {
            commandId: uuidv4(),
            creativeSetId: uuidv4(),
            advertiserId: advertiserId,
            parentCreativeSetId: parentCreativeSetId,
            name: folderName,
            defaultTargetURL: defaultTargetUrl,
            productCategoryId: productCategoryId,
        };
        const config = {
            headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' }
        };
        console.log(`Tworzenie nowego folderu "${folderName}"...`);
        const response = await axios.post(API_URL_CREATE_SET, requestBody, config);
        if (response.status !== 200) {
            console.error(`Błąd: Otrzymano status ${response.status}`);
            return null;
        }
        if (response.data && response.data.errors) {
            console.error('Błąd z API:', response.data.errors);
            return null;
        }
        console.log(`Nowy folder "${folderName}" został pomyślnie utworzony. ID: ${requestBody.creativeSetId}`);
        return requestBody.creativeSetId;
    } catch (error) {
        console.error('Błąd podczas tworzenia folderu:', error.message);
        if (error.response) console.error('Szczegóły błędu:', error.response.data);
        return null;
    }
}

// --- Funkcja do tworzenia kreacji display ---
async function createDisplayCreative(creativeData, base64Image) {
    try {
        const requestBody = {
            commandId: uuidv4(),
            creativeId: uuidv4(),
            creativeSetId: creativeData.creativeSetId,
            name: creativeData.creativeName,
            base64: base64Image,
            presentation: {
                altTag: creativeData.creativeName
            },
            targetUrl: creativeData.targetUrl,
            status: 'ACTIVE',
        };
        const config = {
            headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' }
        };
        const response = await axios.post(API_URL_CREATE_DISPLAY_CREATIVE, requestBody, config);
        if (response.status !== 200) {
            console.error(`Błąd: Otrzymano status ${response.status}`);
            return null;
        }
        if (response.data && response.data.errors) {
            console.error('Błąd z API:', response.data.errors);
            return null;
        }
        console.log(`Kreacja "${creativeData.creativeName}" została pomyślnie utworzona!`);
        return response.data;
    } catch (error) {
        console.error(`Wystąpił błąd podczas tworzenia kreacji "${creativeData.creativeName}":`, error.message);
        if (error.response) console.error('Szczegóły błędu:', error.response.data);
        return null;
    }
}

// --- Główna funkcja zarządzająca całym procesem (runAutomation) ---
async function runAutomation(record) {
    const { advertiserId, creativeName, campaignPeriod, targetUrl, displays } = record;

    console.log('--- Rozpoczynam automatyzację tworzenia kreacji ---');
    console.log('Dane wejściowe:', { advertiserId, creativeName, campaignPeriod, targetUrl, displays });

    if (!displays || !displays.startsWith('http')) {
        console.error(`Błąd: Niepoprawny URL pliku ZIP w wierszu dla kreacji "${creativeName}".`);
        console.log('-------------------------------------------');
        return;
    }

    let finalTargetUrl = targetUrl;
    if (advertiserId === '76829') {
        const urlSeparator = targetUrl.includes('?') ? '&' : '?';
        const urlParams = `${urlSeparator}utm_source=pp&utm_medium=cps&utm_campaign=SalesMedia&utm_content=#{PARTNER_ID}`;
        finalTargetUrl = `${targetUrl}${urlParams}`;
        console.log(`Dla reklamodawcy ${advertiserId}, URL został zmodyfikowany na: ${finalTargetUrl}`);
    }

    const parentFolderId = await findDisplayFolderId(advertiserId);
    if (!parentFolderId) {
        console.log('Proces anulowany.');
        console.log('-------------------------------------------');
        return;
    }

    const highestNumber = await findHighestCreativeNumber(parentFolderId, advertiserId);
    const newCreativeNumber = highestNumber + 1;
    let newCreativeFolderName = campaignPeriod ?
        `${newCreativeNumber} - ${creativeName} - ${campaignPeriod}` :
        `${newCreativeNumber} - ${creativeName}`;
    console.log(`Nowa nazwa folderu to: "${newCreativeFolderName}"`);

    const productCategoryId = await getProductCategoryIdFromSet(parentFolderId);
    if (!productCategoryId) {
        console.log('Proces anulowany.');
        console.log('-------------------------------------------');
        return;
    }

    let zipFileContent;
    try {
        const zipResponse = await axios.get(displays, { responseType: 'arraybuffer' });
        zipFileContent = zipResponse.data;
        console.log(`Pobrano plik ZIP z ${displays}.`);
    } catch (error) {
        console.error(`Błąd podczas pobierania pliku ZIP:`, error.message);
        console.log('Proces anulowany.');
        console.log('-------------------------------------------');
        return;
    }

    const zip = await JSZip.loadAsync(zipFileContent);

    const newFolderId = await createNewSubfolder(advertiserId, parentFolderId, newCreativeFolderName, finalTargetUrl, productCategoryId);
    if (!newFolderId) {
        console.log('Proces anulowany.');
        console.log('-------------------------------------------');
        return;
    }

    for (const fileName in zip.files) {
        if (!zip.files[fileName].dir) {
            const file = zip.files[fileName];
            const mimeType = path.extname(fileName).toLowerCase().substring(1);
            const base64Data = await file.async("base64");
            const base64Image = `data:image/${mimeType};base64,${base64Data}`;

            const creativeData = {
                creativeName: fileName, // Używamy oryginalnej nazwy pliku
                creativeSetId: newFolderId,
                targetUrl: finalTargetUrl,
            };

            await createDisplayCreative(creativeData, base64Image);
            console.log('-------------------------------------------');
        }
    }
}

// --- Funkcja do odczytywania i przetwarzania pliku Excel (NOWA) ---
async function processExcel(filePath) {
    if (!API_KEY) {
        console.error('Błąd: Klucz API nie jest ustawiony w pliku .env!');
        return;
    }

    try {
        const workbook = xlsx.readFile(filePath);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const records = xlsx.utils.sheet_to_json(worksheet);

        if (records.length === 0) {
            console.error('Błąd: Plik Excel jest pusty lub nie zawiera poprawnych nagłówków.');
            return;
        }

        console.log(`Przetwarzam ${records.length} wierszy z pliku Excel.`);
        
        for (const record of records) {
            const requiredFields = ['advertiserId', 'creativeName', 'targetUrl', 'displays'];
            const missingFields = requiredFields.filter(field => !record[field]);
            if (missingFields.length > 0) {
                console.error(`Błąd w wierszu dla kreacji "${record.creativeName}": Brakuje wymaganych kolumn: ${missingFields.join(', ')}.`);
                console.log('-------------------------------------------');
                continue;
            }
            await runAutomation(record);
        }

    } catch (error) {
        console.error('Wystąpił błąd:', error.message);
    }
}

// --- Uruchamiamy skrypt z plikiem Excel i ZIP ---
const excelFilePath = process.argv[2];

if (!excelFilePath) {
    console.error('Błąd: Nie podano ścieżki do pliku Excel.');
    console.log('Użycie: node displayCreator.js <nazwa_pliku.xlsx>');
} else {
    processExcel(excelFilePath);
}