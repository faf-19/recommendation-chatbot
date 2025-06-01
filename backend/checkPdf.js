const mongoose = require('mongoose');
const fs = require('fs').promises;
const pdfParse = require('pdf-parse');

const pdfDocumentSchema = new mongoose.Schema({
    filename: String,
    content: String,
    uploadDate: { type: Date, default: Date.now }
});
const PdfDocument = mongoose.model('PdfDocument', pdfDocumentSchema);

async function main() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect('mongodb+srv://BisratAbrham:nchnHeyHqCh46rLT@cluster0.hjgnw.mongodb.net/BookCompassGcProject');
        console.log('Connected to MongoDB');

        // Check existing PDFs
        const pdfs = await PdfDocument.find();
        console.log('Existing PDFs:', pdfs);

        // Process new PDF
        const pdfPath = 'C:/Users/hp/Downloads/Telegram Desktop/Exit Study Plan.pdf';
        console.log('Reading PDF from:', pdfPath);
        
        const dataBuffer = await fs.readFile(pdfPath);
        console.log('PDF file read successfully');
        
        const pdfData = await pdfParse(dataBuffer);
        console.log('PDF parsed successfully, content length:', pdfData.text.length);
        console.log('First 200 characters:', pdfData.text.substring(0, 200));

        // Save to database
        const pdfDoc = new PdfDocument({
            filename: 'Exit Study Plan.pdf',
            content: pdfData.text
        });
        await pdfDoc.save();
        console.log('PDF saved to database');

        // Verify it was saved
        const savedPdfs = await PdfDocument.find();
        console.log('PDFs after save:', savedPdfs);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
}

main(); 