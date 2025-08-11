// Uruchomienie skryptu po całkowitym załadowaniu struktury DOM strony
document.addEventListener('DOMContentLoaded', () => {
    // --- Pobranie referencji do wszystkich potrzebnych elementów DOM ---
    const apiKeyVerification = document.getElementById('apiKeyVerification');
    const apiKeyForm = document.getElementById('apiKeyForm');
    const apiKeyInput = document.getElementById('apiKeyInput');
    const apiKeyMessageContainer = document.getElementById('apiKeyMessageContainer');
    
    const mainContent = document.getElementById('mainContent');
    const uploadForm = document.getElementById('uploadForm');
    const uploadMessageContainer = document.getElementById('uploadMessageContainer');
    const resultsContainer = document.getElementById('resultsContainer');
    const creationsList = document.getElementById('creationsList');

    // --- Obsługa formularza weryfikacji klucza API ---
    apiKeyForm.addEventListener('submit', async (e) => {
        e.preventDefault(); // Zapobiegamy domyślnemu przeładowaniu strony
        apiKeyMessageContainer.textContent = 'Weryfikacja klucza...';
        apiKeyMessageContainer.className = 'message'; // Reset klas CSS

        // Pobranie klucza i usunięcie zbędnych białych znaków
        const apiKey = apiKeyInput.value.trim();
        if (!apiKey) {
            apiKeyMessageContainer.textContent = 'Proszę wprowadzić klucz API.';
            apiKeyMessageContainer.classList.add('error');
            return;
        }

        try {
            // Wysłanie zapytania POST do serwera w celu weryfikacji klucza
            const response = await fetch('/verify-api-key-display', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey })
            });

            const result = await response.json();
            
            if (response.ok) {
                // Jeśli klucz jest poprawny, pokazujemy główną część aplikacji
                apiKeyMessageContainer.textContent = result.message;
                apiKeyMessageContainer.classList.add('success');
                
                // Ukrycie formularza weryfikacji i pokazanie głównego kontentu
                apiKeyVerification.style.display = 'none';
                mainContent.style.display = 'block';

                // Zapisanie klucza w sessionStorage, aby był dostępny na czas trwania sesji
                sessionStorage.setItem('apiKey_display', apiKey);
            } else {
                // Jeśli klucz jest niepoprawny, wyświetlamy błąd
                apiKeyMessageContainer.textContent = result.message;
                apiKeyMessageContainer.classList.add('error');
            }
        } catch (error) {
            // Obsługa błędów sieciowych lub braku odpowiedzi od serwera
            apiKeyMessageContainer.textContent = 'Wystąpił nieoczekiwany błąd serwera podczas weryfikacji.';
            apiKeyMessageContainer.classList.add('error');
        }
    });

    // --- Obsługa formularza wgrywania pliku z kreacjami ---
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault(); // Zapobiegamy przeładowaniu strony
        uploadMessageContainer.textContent = 'Przetwarzanie pliku... Proszę czekać.';
        uploadMessageContainer.className = 'message';
        resultsContainer.style.display = 'none';
        creationsList.innerHTML = ''; // Wyczyszczenie poprzednich wyników

        // Utworzenie obiektu FormData, który pozwoli na wysłanie pliku
        const formData = new FormData(uploadForm);
        const apiKey = sessionStorage.getItem('apiKey_display'); // Pobranie klucza API z pamięci sesji
        
        if (!apiKey) {
            uploadMessageContainer.textContent = 'Błąd: Klucz API nie jest zapisany. Proszę odświeżyć stronę i zweryfikować go ponownie.';
            uploadMessageContainer.classList.add('error');
            return;
        }
        formData.append('apiKey', apiKey); // Dołączenie klucza do wysyłanych danych

        try {
            // Wysłanie zapytania POST z plikiem i kluczem API do serwera
            const response = await fetch('/upload-display', {
                method: 'POST',
                body: formData // W ciele zapytania wysyłamy obiekt FormData
            });

            const result = await response.json();
            
            if (response.ok) {
                // Po pomyślnym przetworzeniu pliku na serwerze
                uploadMessageContainer.textContent = result.message;
                uploadMessageContainer.classList.add('success');
                uploadForm.reset(); // Wyczyszczenie formularza
                
                resultsContainer.style.display = 'block';
                
                // Iteracja po wynikach zwróconych przez serwer i tworzenie listy statusów
                result.results.forEach(creationResult => {
                    const listItem = document.createElement('li');
                    if (creationResult.success) {
                        listItem.textContent = `✅ ${creationResult.message}`;
                        listItem.classList.add('success-item');
                    } else {
                        listItem.textContent = `❌ ${creationResult.message}`;
                        listItem.classList.add('error-item');
                    }
                    creationsList.appendChild(listItem);
                });

            } else {
                // Obsługa błędu zwróconego przez serwer (np. zły format pliku)
                uploadMessageContainer.textContent = result.message;
                uploadMessageContainer.classList.add('error');
            }
        } catch (error) {
            // Obsługa błędów sieciowych
            uploadMessageContainer.textContent = 'Wystąpił nieoczekiwany błąd serwera.';
            uploadMessageContainer.classList.add('error');
        }
    });
});