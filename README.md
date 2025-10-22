# Janu-flashcard-generator
Flash card generator
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Anki Super-Generator</title>
    <!-- 1. Tailwind CSS -->
    <script src="https://cdn.tailwindcss.com"></script>
    
    <!-- 2. Tesseract.js (for Image Occlusion) -->
    <script src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"></script>
    
    <!-- 3. genanki-js (for .apkg generation) -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/file-saver@2.0.5/dist/FileSaver.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-asm.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/genanki-js/dist/genanki.browser.js"></script>
    
    <!-- 4. PDF.js (for PDF parsing) -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js"></script>
    <script>pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';</script>
    
    <!-- 5. Mammoth.js (for DOCX parsing) -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js"></script>

    <style>
        body { font-family: 'Inter', sans-serif; }
        .nav-button {
            transition: all 0.2s;
            border-bottom: 4px solid transparent;
        }
        .nav-button.active {
            border-bottom-color: #3b82f6; /* blue-500 */
            color: #2563eb; /* blue-600 */
        }
        .page { display: none; }
        .page.active { display: block; }
        #io-image-container { position: relative; width: 100%; max-width: 900px; margin: auto; }
        #io-canvas { position: absolute; top: 0; left: 0; cursor: crosshair; }
        #io-display-image { display: block; width: 100%; height: auto; }
    </style>
</head>
<body class="bg-gray-100 text-gray-900">

    <!-- === SETTINGS MODAL === -->
    <div id="settings-modal" class="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg p-8 shadow-xl w-full max-w-2xl">
            <h2 class="text-2xl font-bold mb-4">Welcome! Set Up Your App</h2>
            <p class="mb-4 text-gray-600">Please paste your API key below. This app runs 100% in your browser, so your key is safe and only stored on your computer.</p>
            
            <label for="api-key" class="block text-sm font-medium text-gray-700">Google AI (Gemini) API Key</label>
            <input type="password" id="api-key" class="mt-1 block w-full border-gray-300 rounded-md shadow-sm" placeholder="Paste Gemini API key">
            <p class="text-xs text-gray-500 mt-1 mb-4">Get a free key from <a href="https://aistudio.google.com/app/apikey" target="_blank" class="text-blue-600 hover:underline">Google AI Studio</a>.</p>
            
            <button id="save-settings" class="w-full bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700">Save and Start</button>
        </div>
    </div>
    
    <!-- === LOADING MODAL === -->
    <div id="loading-modal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg p-8 shadow-xl flex items-center space-x-4">
            <svg class="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            <div><h3 id="loading-status" class="text-xl font-medium">Please wait...</h3></div>
        </div>
    </div>
    
    <!-- === HEADER & NAVIGATION === -->
    <header class="bg-white shadow-md">
        <nav class="container mx-auto max-w-7xl flex items-center justify-between p-4">
            <h1 class="text-2xl font-bold text-blue-700">Anki Super-Generator</h1>
            <div class="flex space-x-2 md:space-x-6">
                <button class="nav-button active" data-page="page-home">Create</button>
                <button class="nav-button" data-page="page-image-gen">Image Occlusion</button>
            </div>
            <button id="settings-button" class="text-gray-500 hover:text-blue-600">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.096 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
            </button>
        </nav>
    </header>

    <!-- === MAIN CONTENT === -->
    <main class="container mx-auto max-w-7xl p-4 md:p-8">

        <!-- === PAGE: HOME / CREATE === -->
        <div id="page-home" class="page active">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                <!-- Topic Generator -->
                <div class="bg-white p-6 rounded-lg shadow-md">
                    <h2 class="text-2xl font-bold mb-4">Generate from Topic</h2>
                    <div class="space-y-4">
                        <div>
                            <label for="topic" class="block text-sm font-medium text-gray-700">Topic</label>
                            <input type="text" id="topic" class="mt-1 block w-full border-gray-300 rounded-md shadow-sm" placeholder="e.g., 'The French Revolution'">
                        </div>
                        <div>
                            <label for="topic-deck-name" class="block text-sm font-medium text-gray-700">Deck Name</label>
                            <input type="text" id="topic-deck-name" class="mt-1 block w-full border-gray-300 rounded-md shadow-sm" placeholder="e.g., 'History: French Revolution'">
                        </div>
                        <div>
                            <label for="topic-num-cards" class="block text-sm font-medium text-gray-700">Number of Cards</label>
                            <input type="number" id="topic-num-cards" value="10" min="1" class="mt-1 block w-full border-gray-300 rounded-md shadow-sm">
                        </div>
                        <button id="generate-topic" class="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700">Generate Deck</button>
                    </div>
                </div>

                <!-- Text Generator -->
                <div class="bg-white p-6 rounded-lg shadow-md">
                    <h2 class="text-2xl font-bold mb-4">Generate from Text</h2>
                    <div class="space-y-4">
                        <div>
                            <label for="text-input" class="block text-sm font-medium text-gray-700">Paste your text</label>
                            <textarea id="text-input" rows="8" class="mt-1 block w-full border-gray-300 rounded-md shadow-sm" placeholder="Paste your study notes here..."></textarea>
                        </div>
                        <div>
                            <label for="text-deck-name" class="block text-sm font-medium text-gray-700">Deck Name</label>
                            <input type="text" id="text-deck-name" class="mt-1 block w-full border-gray-300 rounded-md shadow-sm" placeholder="e.g., 'My Biology Notes'">
                        </div>
                        <div>
                            <label for="text-num-cards" class="block text-sm font-medium text-gray-700">Number of Cards</label>
                            <input type="number" id="text-num-cards" value="20" min="1" class="mt-1 block w-full border-gray-300 rounded-md shadow-sm">
                        </div>
                        <button id="generate-text" class="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700">Generate Deck</button>
                    </div>
                </div>
                
                <!-- File Generator -->
                <div class="bg-white p-6 rounded-lg shadow-md md:col-span-2">
                    <h2 class="text-2xl font-bold mb-4">Generate from File (PDF or DOCX)</h2>
                    <div class="space-y-4">
                        <div>
                            <label for="file-upload" class="block text-sm font-medium text-gray-700">Upload .pdf or .docx</label>
                            <input id="file-upload" type="file" accept=".pdf,.docx" class="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
                        </div>
                        <div>
                            <label for="file-deck-name" class="block text-sm font-medium text-gray-700">Deck Name</label>
                            <input type="text" id="file-deck-name" class="mt-1 block w-full border-gray-300 rounded-md shadow-sm" placeholder="e.g., 'Chapter 5 Study Guide'">
                        </div>
                        <div>
                            <label for="file-num-cards" class="block text-sm font-medium text-gray-700">Number of Cards</label>
                            <input type="number" id="file-num-cards" value="20" min="1" class="mt-1 block w-full border-gray-300 rounded-md shadow-sm">
                        </div>
                        <button id="generate-file" class="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700">Generate Deck</button>
                    </div>
                </div>
            </div>
            
            <!-- Log Output -->
            <div class="mt-6 bg-white p-6 rounded-lg shadow-md">
                <label class="block text-sm font-medium text-gray-700 mb-2">Generation Log</label>
                <textarea id="log-output" rows="10" class="w-full p-2 bg-gray-900 text-green-400 font-mono text-sm rounded-md border border-gray-700" readonly>Waiting for task...</textarea>
            </div>
        </div>

        <!-- === PAGE: IMAGE OCCLUSION === -->
        <div id="page-image-gen" class="page">
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <!-- IO Controls -->
                <div class="lg:col-span-1 bg-white p-6 rounded-lg shadow-md h-fit">
                    <h2 class="text-2xl font-bold mb-4">Image Occlusion</h2>
                    <div>
                        <label for="io-image-upload" class="block text-sm font-medium text-gray-700 mb-2">1. Upload Image</label>
                        <input id="io-image-upload" type="file" accept="image/*" class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
                    </div>
                    <div class="mt-6">
                        <label class="block text-sm font-medium text-gray-700 mb-2">2. Scan & Select Text</label>
                        <button id="io-scan-button" disabled class="w-full bg-gray-500 text-white font-bold py-2 px-4 rounded-lg transition disabled:opacity-50">Scan Image</button>
                    </div>
                    <div class="mt-4 flex items-center justify-between">
                        <label for="io-manual-toggle" class="block text-sm font-medium text-gray-700">Manual Mode</label>
                        <input type="checkbox" id="io-manual-toggle" class="h-4 w-4 text-blue-600 rounded">
                    </div>
                    <div class="mt-6">
                        <label class="block text-sm font-medium text-gray-700 mb-2">3. Review Occlusions</label>
                        <div id="io-occlusion-list" class="h-40 bg-gray-50 rounded-lg p-2 overflow-y-auto border">
                            <p id="io-placeholder" class="text-center text-gray-500 p-4">Selected text appears here.</p>
                        </div>
                    </div>
                    <div class="mt-6 border-t pt-6">
                        <label for="io-deck-name" class="block text-sm font-medium text-gray-700 mb-2">4. Export</label>
                        <input type="text" id="io-deck-name" value="My Occlusion Deck" class="block w-full mb-4 border-gray-300 rounded-md shadow-sm">
                        <button id="io-export-button" disabled class="w-full bg-green-600 text-white font-bold py-3 px-4 rounded-lg transition hover:bg-green-700 disabled:opacity-50 disabled:bg-gray-500">Generate .apkg File</button>
                    </div>
                </div>
                <!-- IO Display -->
                <div class="lg:col-span-2 bg-white p-4 rounded-lg shadow-md flex items-center justify-center min-h-[600px]">
                    <div id="io-image-container" class="hidden">
                        <img id="io-display-image" src="" alt="Uploaded image"/>
                        <canvas id="io-canvas"></canvas>
                    </div>
                    <div id="io-upload-placeholder" class="text-center text-gray-500">
                        <svg class="mx-auto h-24 w-24 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48"><path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>
                        <p class="mt-4 text-lg">Upload an image to start</p>
                    </div>
                </div>
            </div>
        </div>

    </main>

    <!-- === JAVASCRIPT === -->
    <script>
        // --- App State ---
        let SQL;
        let tesseractWorker = null;

        // --- DOM Elements ---
        const pages = document.querySelectorAll('.page');
        const navButtons = document.querySelectorAll('.nav-button');
        const settingsModal = document.getElementById('settings-modal');
        const saveSettingsButton = document.getElementById('save-settings');
        const settingsButton = document.getElementById('settings-button');
        const loadingModal = document.getElementById('loading-modal');
        const loadingStatus = document.getElementById('loading-status');
        const logOutput = document.getElementById('log-output');

        // --- Global Utils ---
        function showPage(pageId) {
            pages.forEach(p => p.classList.remove('active'));
            document.getElementById(pageId).classList.add('active');
            navButtons.forEach(b => {
                b.classList.toggle('active', b.dataset.page === pageId);
            });
            // Special case: Home button controls 3 generators
            if (['page-home', 'page-text-gen', 'page-pdf-gen'].includes(pageId)) {
                document.querySelector('.nav-button[data-page="page-home"]').classList.add('active');
            }
        }
        
        function log(message) {
            console.log(message);
            logOutput.value += `\n[${new Date().toLocaleTimeString()}] ${message}`;
            logOutput.scrollTop = logOutput.scrollHeight;
        }

        function showLoading(status) {
            loadingStatus.innerText = status;
            loadingModal.classList.remove('hidden');
        }
        function hideLoading() { loadingModal.classList.add('hidden'); }

        // --- Navigation ---
        navButtons.forEach(button => {
            button.addEventListener('click', () => showPage(button.dataset.page));
        });
        
        // --- Settings & Init ---
        const apiKeyInput = document.getElementById('api-key');
        
        saveSettingsButton.addEventListener('click', () => {
            const apiKey = apiKeyInput.value;
            
            if (!apiKey) {
                alert("Please fill in your API key.");
                return;
            }
            
            localStorage.setItem('geminiApiKey', apiKey);
            settingsModal.classList.add('hidden');
            log("API Key saved.");
        });

        settingsButton.addEventListener('click', () => {
            apiKeyInput.value = localStorage.getItem('geminiApiKey') || '';
            settingsModal.classList.remove('hidden');
        });
        
        function checkSettings() {
            const apiKey = localStorage.getItem('geminiApiKey');
            if (!apiKey) {
                settingsModal.classList.remove('hidden');
            } else {
                log("API Key loaded.");
            }
        }

        // --- Genanki-js Init ---
        async function initSql() {
            try {
                SQL = await initSqlJs({ 
                    locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}` 
                });
                log("Anki packager (sql.js) loaded.");
            } catch (err) {
                console.error("Failed to load sql.js:", err);
                log("ERROR: Could not load Anki packager. Please refresh.");
            }
        }
        
        // --- App Entry Point ---
        document.addEventListener('DOMContentLoaded', () => {
            initSql();
            checkSettings();
            initTesseractWorker(); // Start loading Tesseract immediately
        });
        
        // --- Core: Gemini AI Call ---
        async function callGemini(prompt) {
            const apiKey = localStorage.getItem('geminiApiKey');
            if (!apiKey) {
                alert("API Key not set. Please check settings.");
                return null;
            }
            
            log(`Calling Google AI (gemini-2.5-flash-preview-09-2025)...`);
            
            const schema = {
                type: "OBJECT", properties: {
                    "cards": { type: "ARRAY", items: {
                        type: "OBJECT", properties: {
                            "front": { type: "STRING" }, "back": { type: "STRING" }
                        }, required: ["front", "back"]
                    }}
                }, required: ["cards"]
            };

            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

            const payload = {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json", responseSchema: schema }
            };
            
            try {
                // Add exponential backoff for retries
                let response;
                let delay = 1000;
                for (let i = 0; i < 5; i++) { // Retry up to 5 times
                    response = await fetch(apiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    if (response.ok) {
                        break; // Success
                    }
                    
                    if (response.status === 429) { // Rate limit
                        log(`Rate limited. Retrying in ${delay / 1000}s...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        delay *= 2;
                    } else {
                        // Other error
                        const errorBody = await response.json();
                        throw new Error(`API Error ${response.status}: ${errorBody.error.message}`);
                    }
                }

                if (!response.ok) {
                    throw new Error("API call failed after retries.");
                }

                const result = await response.json();
                
                if (!result.candidates || !result.candidates[0].content) {
                    throw new Error("AI returned an invalid response. This might be due to safety settings or input length.");
                }
                
                const jsonText = result.candidates[0].content.parts[0].text;
                const parsedJson = JSON.parse(jsonText);
                
                if (!parsedJson.cards || parsedJson.cards.length === 0) {
                    throw new Error("AI returned an empty or invalid card list.");
                }
                
                log(`Successfully received ${parsedJson.cards.length} cards from AI.`);
                return parsedJson.cards;

            } catch (err) {
                console.error("Error calling Gemini:", err);
                log(`ERROR: ${err.message}`);
                return null;
            }
        }
        
        // --- Core: .apkg Packaging ---
        async function packageAndDownload(deckName, cards, mediaFiles = []) {
            if (!SQL) {
                log("ERROR: Anki packager not ready. Please wait.");
                alert("Anki packager not ready. Please wait a few seconds and try again.");
                return;
            }
            if (!cards || cards.length === 0) {
                log("ERROR: No cards to package.");
                return;
            }
            
            log("Packaging cards into .apkg file...");
            showLoading("Packaging deck...");
            
            try {
                const basicModel = genanki.Model.BASIC_MODEL;
                const deckId = Date.now();
                const deck = new genanki.Deck(deckId, deckName);

                for (const card of cards) {
                    const note = new genanki.Note(basicModel, [card.front, card.back]);
                    deck.addNote(note);
                }
                
                const pkg = new genanki.Package(deck, mediaFiles);
                const zip = await pkg.save();
                const blob = new Blob([zip]);
                saveAs(blob, `${deckName.replace(/ /g, '_')}.apkg`);
                
                log(`SUCCESS: Deck "${deckName}" has been downloaded!`);

            } catch (err) {
                console.error("Error generating .apkg:", err);
                log(`ERROR: Could not generate .apkg file. ${err.message}`);
            } finally {
                hideLoading();
            }
        }
        
        // --- Generator 1: Topic ---
        const topicButton = document.getElementById('generate-topic');
        topicButton.addEventListener('click', async () => {
            logOutput.value = "Starting new task...";
            const topic = document.getElementById('topic').value;
            const deckName = document.getElementById('topic-deck-name').value || 'AI Topic Deck';
            const numCards = parseInt(document.getElementById('topic-num-cards').value, 10);
            
            if (!topic) { alert("Please enter a topic."); return; }
            if (numCards < 1) { alert("Please enter a valid number of cards."); return; }
            
            showLoading(`Generating ${numCards} cards for "${topic}"...`);
            const prompt = `Generate exactly ${numCards} high-quality flashcards (question and answer pairs) about the topic: "${topic}".`;
            const cards = await callGemini(prompt);
            
            if (cards) {
                await packageAndDownload(deckName, cards);
            } else {
                hideLoading();
            }
        });
        
        // --- Generator 2: Text ---
        const textButton = document.getElementById('generate-text');
        textButton.addEventListener('click', async () => {
            logOutput.value = "Starting new task...";
            const text = document.getElementById('text-input').value;
            const deckName = document.getElementById('text-deck-name').value || 'AI Text Deck';
            const numCards = parseInt(document.getElementById('text-num-cards').value, 10);

            if (!text) { alert("Please paste some text."); return; }
            if (numCards < 1) { alert("Please enter a valid number of cards."); return; }
            
            showLoading("Analyzing text and generating cards...");
            const prompt = `Generate exactly ${numCards} high-quality flashcards (question and answer pairs) based on the following text. Extract the most important facts, definitions, and concepts. Text: "${text}"`;
            const cards = await callGemini(prompt);
            
            if (cards) {
                await packageAndDownload(deckName, cards);
            } else {
                hideLoading();
            }
        });
        
        // --- Generator 3: File (PDF/DOCX) ---
        const fileButton = document.getElementById('generate-file');
        fileButton.addEventListener('click', async () => {
            logOutput.value = "Starting new task...";
            const fileInput = document.getElementById('file-upload');
            const deckName = document.getElementById('file-deck-name').value || 'AI File Deck';
            
            if (!fileInput.files || fileInput.files.length === 0) {
                alert("Please select a .pdf or .docx file."); return;
            }
            
            const file = fileInput.files[0];
            let text = '';
            
            showLoading(`Parsing file: ${file.name}...`);
            
            try {
                if (file.type === "application/pdf") {
                    const reader = new FileReader();
                    reader.onload = async (e) => {
                        const loadingTask = pdfjsLib.getDocument({data: e.target.result});
                        const pdf = await loadingTask.promise;
                        let fullText = '';
                        for (let i = 1; i <= pdf.numPages; i++) {
                            const page = await pdf.getPage(i);
                            const textContent = await page.getTextContent();
                            fullText += textContent.items.map(item => item.str).join(' ') + '\n';
                        }
                        text = fullText;
                        log(`Successfully parsed ${pdf.numPages} pages from PDF.`);
                        await generateCardsFromParsedText(text, deckName);
                    };
                    reader.readAsArrayBuffer(file);
                } else if (file.name.endsWith(".docx")) {
                    const reader = new FileReader();
                    reader.onload = async (e) => {
                        const result = await mammoth.extractRawText({arrayBuffer: e.target.result});
                        text = result.value;
                        log("Successfully parsed DOCX file.");
                        await generateCardsFromParsedText(text, deckName);
                    };
                    reader.readAsArrayBuffer(file);
                } else {
                    throw new Error("Unsupported file type. Please use .pdf or .docx");
                }
            } catch (err) {
                log(`ERROR: ${err.message}`);
                hideLoading();
            }
        });
        
        async function generateCardsFromParsedText(text, deckName) {
            if (!text) {
                log("ERROR: File appears to be empty or could not be read.");
                hideLoading();
                return;
            }
            
            const numCards = parseInt(document.getElementById('file-num-cards').value, 10);
            if (numCards < 1) { alert("Please enter a valid number of cards."); return; }

            showLoading("Analyzing text and generating cards...");
            const prompt = `Generate exactly ${numCards} high-quality flashcards (question and answer pairs) based on the following text. Extract the most important facts, definitions, and concepts. Text: "${text}"`;
            const cards = await callGemini(prompt);
            
            if (cards) {
                await packageAndDownload(deckName, cards);
            } else {
                hideLoading();
            }
        }
        
        // --- Generator 4: Image Occlusion ---
        const io = {
            upload: document.getElementById('io-image-upload'),
            scanBtn: document.getElementById('io-scan-button'),
            exportBtn: document.getElementById('io-export-button'),
            container: document.getElementById('io-image-container'),
            image: document.getElementById('io-display-image'),
            canvas: document.getElementById('io-canvas'),
            uploadPlaceholder: document.getElementById('io-upload-placeholder'),
            list: document.getElementById('io-occlusion-list'),
            placeholder: document.getElementById('io-placeholder'),
            manualToggle: document.getElementById('io-manual-toggle'),
            deckName: document.getElementById('io-deck-name'),
        };
        let io_ctx = io.canvas.getContext('2d');
        let io_imageBlob = null, io_imageFilename = 'image.png';
        let io_ocrResults = [], io_selected = [];
        let io_isManual = false, io_isDrawing = false, io_manualRect = {};

        async function initTesseractWorker() {
            log("Loading AI model for Image Occlusion (Tesseract.js)...");
            tesseractWorker = await Tesseract.createWorker('eng', 1, {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        showLoading(`Scanning image... ${Math.round(m.progress * 100)}%`);
                    }
                }
            });
            log("Image Occlusion AI loaded.");
        }

        io.upload.addEventListener('change', (e) => {
            const file = e.target.files[0]; if (!file) return;
            io_imageBlob = file; io_imageFilename = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
            const reader = new FileReader();
            reader.onload = (event) => {
                io.image.src = event.target.result;
                io.image.onload = () => {
                    io.canvas.width = io.image.clientWidth; io.canvas.height = io.image.clientHeight;
                    io.container.classList.remove('hidden');
                    io.uploadPlaceholder.classList.add('hidden');
                    io.scanBtn.disabled = false; io.scanBtn.classList.replace('bg-gray-500', 'bg-blue-600');
                    io.exportBtn.disabled = true; io_ocrResults = []; io_selected = []; io_updateList();
                    io_ctx.clearRect(0, 0, io.canvas.width, io.canvas.height);
                };
            };
            reader.readAsDataURL(file);
        });

        io.scanBtn.addEventListener('click', async () => {
            if (!tesseractWorker) { alert("AI Model is not ready. Please wait."); return; }
            showLoading("Scanning image for text...");
            try {
                const { data } = await tesseractWorker.recognize(io.image.src);
                io_ocrResults = data.lines.concat(data.words);
                io_drawBoxes();
            } catch (err) { console.error(err); } finally { hideLoading(); }
        });

        io.manualToggle.addEventListener('change', (e) => {
            io_isManual = e.target.checked;
            io.canvas.style.cursor = io_isManual ? 'crosshair' : 'default';
            if (!io_isManual) io_drawBoxes();
        });

        function io_getCanvasClick(e) {
            const rect = io.canvas.getBoundingClientRect();
            const naturalX = (e.clientX - rect.left) * (io.image.naturalWidth / io.image.clientWidth);
            const naturalY = (e.clientY - rect.top) * (io.image.naturalHeight / io.image.clientHeight);
            return { x: naturalX, y: naturalY };
        }
        function io_scaleBbox(bbox) {
            const scaleX = io.canvas.width / io.image.naturalWidth;
            const scaleY = io.canvas.height / io.image.naturalHeight;
            return { x: bbox.x0 * scaleX, y: bbox.y0 * scaleY, w: (bbox.x1 - bbox.x0) * scaleX, h: (bbox.y1 - bbox.y0) * scaleY };
        }
        function io_drawBoxes() {
            io_ctx.clearRect(0, 0, io.canvas.width, io.canvas.height);
            for (const item of io_ocrResults) {
                const { x, y, w, h } = io_scaleBbox(item.bbox);
                io_ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)'; io_ctx.lineWidth = 2; io_ctx.strokeRect(x, y, w, h);
            }
            for (const occ of io_selected) {
                if (occ.bbox) {
                    const { x, y, w, h } = io_scaleBbox(occ.bbox);
                    io_ctx.fillStyle = 'rgba(2, 132, 199, 0.7)'; io_ctx.fillRect(x, y, w, h);
                }
            }
        }
        function io_addOcclusion(text, bbox) {
            if (io_selected.some(o => o.text === text)) return;
            io_selected.push({ text, bbox }); io_updateList();
        }
        function io_removeOcclusion(text) {
            io_selected = io_selected.filter(o => o.text !== text);
            io_updateList(); io_drawBoxes();
        }
        function io_updateList() {
            if (io_selected.length === 0) {
                io.list.innerHTML = ''; io.list.appendChild(io.placeholder);
                io.exportBtn.disabled = true;
            } else {
                io.placeholder.remove(); io.list.innerHTML = '';
                io_selected.forEach(occ => {
                    const item = document.createElement('div');
                    item.className = 'p-2 bg-blue-100 rounded text-sm mb-1 flex justify-between items-center';
                    item.textContent = occ.text;
                    const btn = document.createElement('button');
                    btn.innerHTML = '&times;'; btn.className = 'font-bold text-red-500 pl-2';
                    btn.onclick = () => io_removeOcclusion(occ.text);
                    item.appendChild(btn); io.list.appendChild(item);
                });
                io.exportBtn.disabled = false;
            }
        }
        io.canvas.addEventListener('mousedown', (e) => { if (io_isManual) { io_isDrawing = true; io_manualRect.startX = e.offsetX; io_manualRect.startY = e.offsetY; }});
        io.canvas.addEventListener('mousemove', (e) => {
            if (io_isManual && io_isDrawing) {
                io_drawBoxes(); const { x, y } = io_manualRect; const w = e.offsetX - x; const h = e.offsetY - y;
                io_ctx.strokeStyle = '#0284c7'; io_ctx.lineWidth = 2; io_ctx.strokeRect(x, y, w, h);
            }
        });
        io.canvas.addEventListener('mouseup', (e) => {
            if (io_isManual && io_isDrawing) {
                io_isDrawing = false;
                const bbox = { x0: Math.min(io_manualRect.startX, e.offsetX), y0: Math.min(io_manualRect.startY, e.offsetY), x1: Math.max(io_manualRect.startX, e.offsetX), y1: Math.max(io_manualRect.startY, e.offsetY) };
                // Scale to natural size
                const naturalBbox = {
                    x0: bbox.x0 * (io.image.naturalWidth / io.image.clientWidth), y0: bbox.y0 * (io.image.naturalHeight / io.image.clientHeight),
                    x1: bbox.x1 * (io.image.naturalWidth / io.image.clientWidth), y1: bbox.y1 * (io.image.naturalHeight / io.image.clientHeight)
                };
                const text = prompt("What text is in this box?");
                if (text) io_addOcclusion(text, naturalBbox);
                io_drawBoxes();
            }
        });
        io.canvas.addEventListener('click', (e) => {
            if (io_isManual || io_isDrawing) return;
            const { x, y } = io_getCanvasClick(e);
            for (const item of io_ocrResults) {
                const { bbox } = item;
                if (x >= bbox.x0 && x <= bbox.x1 && y >= bbox.y0 && y <= bbox.y1) {
                    const idx = io_selected.findIndex(o => o.bbox && o.bbox.x0 === bbox.x0);
                    if (idx > -1) io_selected.splice(idx, 1);
                    else io_addOcclusion(item.text.trim(), bbox);
                    io_drawBoxes(); return;
                }
            }
        });
        io.exportBtn.addEventListener('click', async () => {
            if (io_selected.length === 0 || !SQL) { alert("Select occlusions or wait for packager."); return; }
            showLoading("Generating Occlusion Deck...");
            try {
                const clozeModel = genanki.Model.CLOZE_MODEL;
                const deckName = io.deckName.value || 'Image Occlusion Deck';
                const deck = new genanki.Deck(Date.now(), deckName);
                const mediaFiles = [{ name: io_imageFilename, data: io_imageBlob }];
                let clozeText = '';
                io_selected.forEach((occ, i) => {
                    const cleanText = occ.text.replace(/{/g, '{{c' + (i+1) + '::').replace(/}/g, '}}');
                    clozeText += `{{c${i+1}::${cleanText}}} `;
                });
                const noteText = `${clozeText}<br><br><img src="${io_imageFilename}">`;
                const note = new genanki.Note(clozeModel, [noteText, `Occlusion card for ${io_imageFilename}`]);
                deck.addNote(note);
                const pkg = new genanki.Package(deck, mediaFiles);
                const zip = await pkg.save();
                saveAs(new Blob([zip]), `${deckName.replace(/ /g, '_')}.apkg`);
                log(`SUCCESS: Deck "${deckName}" downloaded!`);
            } catch (err) { console.error(err); log("ERROR: Could not generate occlusion deck."); }
            finally { hideLoading(); }
        });
        
    </script>
</body>
</html>
