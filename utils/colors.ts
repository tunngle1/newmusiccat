export const getDominantColor = (imageUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = imageUrl;

        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            if (!ctx) {
                resolve('#000000');
                return;
            }

            // Resize image to small dimension for faster processing
            canvas.width = 50;
            canvas.height = 50;

            ctx.drawImage(img, 0, 0, 50, 50);

            try {
                const imageData = ctx.getImageData(0, 0, 50, 50).data;
                let r = 0, g = 0, b = 0;
                let count = 0;

                for (let i = 0; i < imageData.length; i += 4) {
                    r += imageData[i];
                    g += imageData[i + 1];
                    b += imageData[i + 2];
                    count++;
                }

                r = Math.floor(r / count);
                g = Math.floor(g / count);
                b = Math.floor(b / count);

                resolve(`rgb(${r}, ${g}, ${b})`);
            } catch (e) {
                // Fallback if CORS prevents reading data
                console.warn('Could not extract color due to CORS', e);
                resolve('#1a1a1a');
            }
        };

        img.onerror = () => {
            resolve('#1a1a1a');
        };
    });
};
