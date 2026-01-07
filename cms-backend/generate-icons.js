/**
 * PWA Icon Generator Script
 * 
 * This script generates PWA icons from the logo_excava.png file.
 * 
 * Prerequisites:
 *   npm install sharp
 * 
 * Usage:
 *   node generate-icons.js
 * 
 * The script will create all required icon sizes in the public/icons directory.
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const SOURCE_IMAGE = path.join(__dirname, 'public', 'logo_excava.png');
const OUTPUT_DIR = path.join(__dirname, 'public', 'icons');

async function generateIcons() {
    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    console.log('Generating PWA icons from:', SOURCE_IMAGE);
    console.log('Output directory:', OUTPUT_DIR);
    console.log('');

    for (const size of ICON_SIZES) {
        const outputPath = path.join(OUTPUT_DIR, `icon-${size}x${size}.png`);

        try {
            await sharp(SOURCE_IMAGE)
                .resize(size, size, {
                    fit: 'contain',
                    background: { r: 15, g: 20, b: 25, alpha: 1 } // Dark background matching theme
                })
                .png()
                .toFile(outputPath);

            console.log(`✓ Generated: icon-${size}x${size}.png`);
        } catch (error) {
            console.error(`✗ Failed to generate icon-${size}x${size}.png:`, error.message);
        }
    }

    console.log('');
    console.log('Icon generation complete!');
}

// Run the generator
generateIcons().catch(console.error);
