# Janu-flashcard-generator
Flash card generator
Anki Super-Generator (Offline Version)

This is a 100% free, private, offline-first application that combines multiple AI-powered Anki deck generators into one tool. It is a free alternative to sites like anki-decks.com, but with no community features, no database, and no sharing.

It runs entirely in your browser and is 100% free to host and run.

Features

Generate from Topic: Give the AI a topic and get a deck.

Generate from Text: Paste your notes and get a deck.

Generate from PDF/DOCX: Upload a file and get a deck.

Image Occlusion: Upload an image, and the app's built-in AI will find the text for you to hide.

How This is 100% Free

AI (Gemini): It uses your own free Google AI Studio API key. You stay within the generous free tier, and all requests are private between your browser and Google.

AI (Tesseract): The Image Occlusion AI (Tesseract.js) is an open-source library that runs 100% on your computer. It's totally free and has no limits.

Hosting: You can host this single HTML file for free on GitHub Pages.

File Parsing: The PDF and DOCX readers (PDF.js, Mammoth.js) are also open-source and run entirely in your browser.

Required Setup (Only 1 Step)

You MUST do this one step for the AI generators to work.

Get Your Google AI (Gemini) API Key

Go to Google AI Studio.

Log in with your Google account.

Click "Create API key in new project".

Copy the long key.

Open the app, click the Settings gear (⚙️) in the top-right corner.

Paste this key into the API key field and click Save.

That's it! The app is ready to use.

Your Questions Answered

1. On Card Limits (I've removed them)

You asked to remove the card limits, and I have. You can now type any number into the "Number of Cards" field for the Topic, Text, and File generators.

Warning: The Gemini API has a context limit (how much text it can read at once). If you paste a 500-page book or a 100,000-word PDF, the API call will fail. It's best to use smaller chunks of text (like a chapter at a time) to get good results.

2. On the Anki FSRS Scheduler

You asked about the FSRS scheduler. This is a fantastic idea!

FSRS is a scheduling algorithm inside the Anki application itself. It is not something that can be included in an .apkg file.

The good news is that all decks you create with this tool are 100% compatible with FSRS.

To use it, you just need to:

Import the .apkg file into Anki (on your computer or mobile).

Click the gear icon next to your deck and choose "Options".

Go to the "Advanced" tab.

Enable the "FSRS" scheduler.

(Optional but recommended) Let Anki analyze your study history to optimize the parameters.

3. On Open-Source Features

You asked to use open-source features, and this app is built almost entirely on them!

Image Occlusion AI: Tesseract.js (Open Source)

.apkg File Generation: genanki-js (Open Source)

PDF Reading: PDF.js (Open-Source)

DOCX Reading: Mammoth.js (Open Source)

The only part that isn't open-source is the Gemini AI, which provides the "general knowledge" you wanted from the paid site. You are using the best possible combination of free and open-source tools.
