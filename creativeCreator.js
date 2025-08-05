const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// --- Konfiguracja i stałe ---
const API_KEY = '56020f0d-a880-4dd7-a6e2-d90afde1d07f'; // <--- UZUPEŁNIJ TUTAJ SWÓJ KLUCZ API!
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
    const config = {
      headers: { 'x-api-key': API_KEY },
      params: { advertiserId: advertiserId }
    };
    
    // Wyszukujemy folder, który zawiera "link" w nazwie, bez względu na wielkość liter
    const searchPattern = /link/i;
    console.log(`Wyszukiwanie folderu zawierającego "link" dla reklamodawcy ID: ${advertiserId}...`);
    
    const response = await axios.get(API_URL_LIST_SETS, config);

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
    
    console.log(`Pobieranie productCategoryId z folderu o ID: ${creativeSetId}...`);
    const response = await axios.get(API_URL_GET_SINGLE_SET, config);

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
    
    if (response.status === 200) {
      console.log(`Nowy folder "${folderName}" został pomyślnie utworzony. ID: ${requestBody.creativeSetId}`);
      return requestBody.creativeSetId;
    } else {
      console.error(`Błąd podczas tworzenia folderu "${folderName}".`);
      if (error.response) console.error('Szczegóły błędu:', error.response.data);
      return null;
    }
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
    
    if (response.status === 200) {
      console.log(`Kreacja "${creativeData.creativeName}" została pomyślnie utworzona!`);
      console.log('Odpowiedź serwera:', response.data);
      return response.data;
    } else {
      console.error(`Błąd: Otrzymano status ${response.status} dla kreacji "${creativeData.creativeName}"`);
      if (error.response) console.error('Szczegóły błędu:', error.response.data);
    }
  } catch (error) {
    console.error(`Wystąpił błąd podczas tworzenia kreacji "${creativeData.creativeName}":`, error.message);
    if (error.response) console.error('Szczegóły błędu:', error.response.data);
  }
}

// --- NOWA, POPRAWIONA FUNKCJA DO ZNAJDOWANIA NAJWYŻSZEJ LICZBY W NAZWACH FOLDERÓW ---
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

// --- Główna funkcja zarządzająca całym procesem (ZAKTUALIZOWANA) ---
async function runAutomation(advertiserId, creativeName, campaignPeriod, targetUrl) {
    console.log('--- Rozpoczynam automatyzację tworzenia kreacji ---');

    // Krok 1: Znajdź ID folderu 'Link TXT'
    const parentFolderId = await findLinkTxtFolderId(advertiserId);
    if (!parentFolderId) {
        console.log('Proces anulowany.');
        return;
    }

    // Krok 2: Znajdź najwyższy numer folderu i wygeneruj nową nazwę
    const highestNumber = await findHighestCreativeNumber(parentFolderId, advertiserId);
    const newCreativeNumber = highestNumber + 1;
    
    // Tworzenie nazwy folderu
    let newCreativeFolderName;
    if (campaignPeriod) {
        newCreativeFolderName = `${newCreativeNumber} - ${creativeName} - ${campaignPeriod}`;
    } else {
        newCreativeFolderName = `${newCreativeNumber} - ${creativeName}`;
    }
    console.log(`Nowa nazwa folderu to: "${newCreativeFolderName}"`);

    // Krok 3: Pobierz ID kategorii produktu z folderu 'Link TXT'
    const productCategoryId = await getProductCategoryIdFromSet(parentFolderId);
    if (!productCategoryId) {
        console.log('Proces anulowany.');
        return;
    }

    // Krok 4: Utwórz nowy podfolder
    const newFolderId = await createNewSubfolder(advertiserId, parentFolderId, newCreativeFolderName, targetUrl, productCategoryId);
    if (!newFolderId) {
        console.log('Proces anulowany.');
        return;
    }

    // Krok 5: Utwórz kreację w nowym folderze
    const creativeNameWithPrefix = `LinkTXT - ${newCreativeFolderName}`;

    const myCreative = {
        creativeName: creativeNameWithPrefix, // Nowa zmienna z prefiksem
        creativeContent: creativeNameWithPrefix,
        creativeSetId: newFolderId,
        targetUrl: targetUrl,
    };
    await createLinkCreative(myCreative);

    console.log('--- Automatyzacja zakończona ---');
}

// --- Uruchomienie skryptu ---
const advertiserId = process.argv[2];
const creativeName = process.argv[3];
const campaignPeriod = process.argv[4];
const targetUrl = process.argv[5];

// Walidacja - upewniamy się, że wymagane argumenty zostały podane
if (!advertiserId || !creativeName || !targetUrl) {
  console.error('Błąd: Brakuje wymaganych argumentów.');
  console.log('Użycie: node creativeCreator.js <ID_reklamodawcy> "<nazwa_kreacji>" "[opcjonalny_okres_kampanii]" "<URL_docelowy>"');
} else {
  runAutomation(advertiserId, creativeName, campaignPeriod, targetUrl);
}