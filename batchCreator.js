// batchCreator.js

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx'); // Poprawna instrukcja require
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// --- Konfiguracja i stałe ---
const API_KEY = process.env.API_KEY; 
const API_BASE_URL = 'https://api.system.netsalesmedia.pl';

const LINK_TXT_FOLDER_NAME = 'Link TXT';

// --- Adresy URL endpointów API ---
const API_URL_LIST_SETS = `${API_BASE_URL}/creatives/creativeset/list`;
const API_URL_GET_SINGLE_SET = `${API_BASE_URL}/creatives/creativeset/single`;
const API_URL_CREATE_SET = `${API_BASE_URL}/creatives/creativeset/create`;
const API_URL_CREATE_CREATIVE = `${API_BASE_URL}/creatives/creative/link/create`;

// --- Funkcja do szukania folderu 'Link TXT' ---
async function findLinkTxtFolderId(advertiserId) {
  try {
    const searchPattern = /link/i;
    const config = {
      headers: { 'x-api-key': API_KEY },
      params: { advertiserId: advertiserId }
    };
    const response = await axios.get(API_URL_LIST_SETS, config);
    if (response.status !== 200) {
      console.error(`Błąd: Otrzymano status ${response.status}`);
      return null;
    }
    if (response.data && Array.isArray(response.data)) {
      const linkTxtFolder = response.data.find(set => searchPattern.test(set.name));
      if (linkTxtFolder) {
        console.log(`Znaleziono folder "${linkTxtFolder.name}" z ID: ${linkTxtFolder.creativeSetId}`);
        return linkTxtFolder.creativeSetId;
      } else {
        console.error(`Nie znaleziono folderu zawierającego "link" dla podanego reklamodawcy.`);
        return null;
      }
    } else {
      console.error('Błąd: Odpowiedź API nie zawiera listy folderów.');
      return null;
    }
  } catch (error) {
    console.error('Błąd podczas wyszukiwania folderu:', error.message);
    if (error.response) console.error('Szczegóły błędu:', error.response.data);
    return null;
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

// --- Funkcja do tworzenia kreacji ---
async function createLinkCreative(creativeData) {
  try {
    const requestBody = {
      commandId: uuidv4(),
      creativeId: uuidv4(),
      creativeSetId: creativeData.creativeSetId,
      name: creativeData.creativeName,
      content: '.',
      description: 'Automatycznie stworzona kreacja przez skrypt',
      targetUrl: creativeData.targetUrl,
      status: 'ACTIVE',
    };
    const config = {
      headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' }
    };
    console.log(`Tworzenie kreacji "${creativeData.creativeName}" w folderze ${creativeData.creativeSetId}...`);
    const response = await axios.post(API_URL_CREATE_CREATIVE, requestBody, config);
    if (response.status !== 200) {
      console.error(`Błąd: Otrzymano status ${response.status} dla kreacji "${creativeData.creativeName}"`);
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
        console.log(`Pobieranie listy podfolderów z Creative Set ID: ${parentCreativeSetId}...`);
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

// --- Główna funkcja zarządzająca całym procesem (runAutomation) ---
async function runAutomation(advertiserId, creativeName, campaignPeriod, targetUrl) {
    console.log('--- Rozpoczynam automatyzację tworzenia kreacji ---');
    console.log('Dane wejściowe:', { advertiserId, creativeName, campaignPeriod, targetUrl });

    let urlSeparator = '?';
    if (targetUrl.includes('?')) {
        urlSeparator = '&';
    }

    let finalTargetUrl = targetUrl;
    if (advertiserId === '76829') {
        const urlParams = `${urlSeparator}utm_source=pp&utm_medium=cps&utm_campaign=SalesMedia&utm_content=#{PARTNER_ID}`;
        finalTargetUrl = `${targetUrl}${urlParams}`;
        console.log(`Dla reklamodawcy ${advertiserId}, URL został zmodyfikowany na: ${finalTargetUrl}`);
    }

    const parentFolderId = await findLinkTxtFolderId(advertiserId);
    if (!parentFolderId) {
        console.log('Proces anulowany.');
        return;
    }

    const highestNumber = await findHighestCreativeNumber(parentFolderId, advertiserId);
    const newCreativeNumber = highestNumber + 1;
    
    let newCreativeFolderName;
    if (campaignPeriod) {
        newCreativeFolderName = `${newCreativeNumber} - ${creativeName} - ${campaignPeriod}`;
    } else {
        newCreativeFolderName = `${newCreativeNumber} - ${creativeName}`;
    }
    console.log(`Nowa nazwa folderu to: "${newCreativeFolderName}"`);

    const productCategoryId = await getProductCategoryIdFromSet(parentFolderId);
    if (!productCategoryId) {
        console.log('Proces anulowany.');
        return;
    }

    const newFolderId = await createNewSubfolder(advertiserId, parentFolderId, newCreativeFolderName, finalTargetUrl, productCategoryId);
    if (!newFolderId) {
        console.log('Proces anulowany.');
        return;
    }

    const creativeNameWithPrefix = `LinkTXT - ${newCreativeFolderName}`;
    const myCreative = {
        creativeName: creativeNameWithPrefix,
        creativeContent: '.',
        creativeSetId: newFolderId,
        targetUrl: finalTargetUrl,
    };
    await createLinkCreative(myCreative);

    console.log('--- Automatyzacja zakończona ---');
}

// --- Funkcja do odczytywania i przetwarzania pliku Excel ---
function processExcel(filePath) {
    if (!API_KEY) {
        console.error('Błąd: Klucz API nie jest ustawiony w pliku .env!');
        return;
    }

    try {
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0]; // Bierzemy pierwszy arkusz
        const worksheet = workbook.Sheets[sheetName];
        
        // Konwertujemy arkusz na tablicę obiektów JSON
        const records = xlsx.utils.sheet_to_json(worksheet);

        if (records.length === 0) {
            console.error('Błąd: Plik Excel jest pusty lub nie zawiera poprawnych nagłówków.');
            return;
        }

        console.log(`Przetwarzam ${records.length} wierszy z pliku Excel.`);

        // Pętla asynchroniczna do przetwarzania każdego wiersza
        (async () => {
            for (const record of records) {
                const advertiserId = String(record.advertiserId);
                const creativeName = String(record.creativeName);
                const campaignPeriod = record.campaignPeriod ? String(record.campaignPeriod) : null;
                const targetUrl = String(record.targetUrl);
                
                await runAutomation(advertiserId, creativeName, campaignPeriod, targetUrl);
                console.log('-------------------------------------------');
            }
        })();

    } catch (error) {
        console.error('Wystąpił błąd podczas odczytu pliku Excel:', error.message);
    }
}

// --- Uruchamiamy skrypt z plikiem Excel ---
const excelFilePath = process.argv[2];

if (!excelFilePath) {
    console.error('Błąd: Nie podano ścieżki do pliku Excel.');
    console.log('Użycie: node batchCreator.js <nazwa_pliku.xlsx>');
} else {
    processExcel(excelFilePath);
}