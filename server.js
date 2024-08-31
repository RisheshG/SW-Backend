const express = require('express');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

let spamWords = {};

// Load spam words from the CSV file
const loadSpamWords = () => {
  return new Promise((resolve, reject) => {
    fs.createReadStream(path.join(__dirname, 'spam_words.csv'))
      .pipe(csv())
      .on('data', (row) => {
        const { Word, Category } = row;
        spamWords[Word.toLowerCase()] = Category;
      })
      .on('end', () => {
        resolve();
      })
      .on('error', (error) => {
        reject(error);
      });
  });
};

// Load the spam words when the server starts
loadSpamWords()
  .then(() => {
    console.log('Spam words loaded successfully.');
  })
  .catch((err) => {
    console.error('Error loading spam words:', err);
  });

// Define an endpoint to check spammy words
app.post('/check-spam', (req, res) => {
  const { text } = req.body;
  let highlightedText;
  let categoryCounts = {};
  let overallScore = 0;

  // Calculate word count
  const wordCount = text.split(/\s+/).filter(word => word.length > 0).length;

  // Calculate reading time (approximation)
  const readingSpeed = 200; // Average words per minute
  const readingTime = Math.ceil(wordCount / readingSpeed);

  // Escape HTML characters to prevent invalid HTML
  const escapeHtml = (str) => {
    return str.replace(/[&<>"']/g, (match) => {
      switch (match) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#039;';
        default: return match;
      }
    });
  };

  // Escape the initial text before applying highlights
  let escapedText = escapeHtml(text);

  // Additional patterns to check
  const additionalPatterns = [
    { pattern: /for just \$\d+/gi, category: 'Money' }, // For just $ (amount)
    { pattern: /dear \S+@\S+\.\S+/gi, category: 'Unnatural' }, // Dear (email address)
    { pattern: /dear [a-zA-Z]+/gi, category: 'Unnatural' }, // Dear (name)
    { pattern: /before \d{1,2}\/\d{1,2}\/\d{2,4}/gi, category: 'Urgency' } // before (date)
  ];

  // Process additional patterns
  additionalPatterns.forEach(({ pattern, category }) => {
    escapedText = escapedText.replace(pattern, (match) => {
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      overallScore++;
      return `{{HIGHLIGHT_START_${category}}}${match}{{HIGHLIGHT_END}}`;
    });
  });

  // Loop through each spam word and category
  for (const [word, category] of Object.entries(spamWords)) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi'); // Match whole words with word boundaries
    escapedText = escapedText.replace(regex, (match) => {
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      overallScore++;
      return `{{HIGHLIGHT_START_${category}}}${match}{{HIGHLIGHT_END}}`;
    });
  }

  // Replace placeholders with HTML tags after all replacements are done
  highlightedText = escapedText
    .replace(/{{HIGHLIGHT_START_(\w+)}}/g, '<span class="highlight $1">')
    .replace(/{{HIGHLIGHT_END}}/g, '</span>');

  // Determine score description
  let scoreDescription;
  if (overallScore === 0) {
    scoreDescription = 'Great';
  } else if (overallScore <= 3) {
    scoreDescription = 'Okay';
  } else if (overallScore <= 5) {
    scoreDescription = 'Poor';
  } else {
    scoreDescription = 'Bad';
  }

  res.json({ highlightedText, categoryCounts, overallScore, scoreDescription, wordCount, readingTime });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Spam checker backend running on port ${PORT}`);
});
