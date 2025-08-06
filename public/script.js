document.addEventListener('DOMContentLoaded', (event) => {
    const selectElement = document.getElementById('advertiserSelect');
    const advertiserIdField = document.getElementById('advertiserIdField');
    const form = document.getElementById('creativeForm');
    const submitBtn = document.getElementById('submitBtn');
    const messageContainer = document.getElementById('messageContainer');

    function toggleAdvertiserIdField() {
        if (selectElement.value === 'manual') {
            advertiserIdField.style.display = 'block';
        } else {
            advertiserIdField.style.display = 'none';
        }
    }
    
    selectElement.addEventListener('change', toggleAdvertiserIdField);
    toggleAdvertiserIdField();

submitBtn.addEventListener('click', async () => {
    messageContainer.textContent = '';
    messageContainer.className = '';

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    try {
        const response = await fetch('/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });

        const result = await response.json();

        if (response.ok) {
            messageContainer.textContent = result.message;
            messageContainer.classList.add('message', 'success');
            // czyścimy wybrane pola
            document.getElementById('creativeName').value = '';
            document.getElementById('campaignPeriod').value = '';
            document.getElementById('targetUrl').value = '';
        } else {
            messageContainer.textContent = result.message;
            messageContainer.classList.add('message', 'error');
        }
    } catch (error) {
        console.error('Błąd: ', error);
        messageContainer.textContent = 'Wystąpił błąd podczas wysyłania danych.';
        messageContainer.classList.add('message', 'error');
    }
});
});