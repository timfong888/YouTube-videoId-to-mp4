const functions = require('firebase-functions');
const admin = require('firebase-admin');
const ytdl = require('@distube/ytdl-core');


admin.initializeApp();

exports.videoIdToMP4 = functions.https.onRequest(async (req, res) => {
    const apiKey = functions.config().myapi.key;
    let responseSent = false;

    // Check for API key in headers
    const providedApiKey = req.headers['x-api-key'];
    if (providedApiKey !== apiKey) {
        res.status(401).send('Unauthorized');
        responseSent = true;
        return;
    }

    // Check request method
    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        responseSent = true;
        return;
    }

    const videoId = req.body.videoId;
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    try {
        const info = await ytdl.getInfo(videoUrl);
        const lengthSeconds = info.videoDetails.lengthSeconds;
        const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');

        if (audioFormats.length === 0) {
            res.status(404).send('No audio formats available for this video');
            responseSent = true;
            return;
        }

        const lowestQualityFormat = audioFormats.sort((a, b) => a.audioBitrate - b.audioBitrate)[0];
        console.log(lowestQualityFormat);

        const fileExtension = lowestQualityFormat.container;
        const contentLength = lowestQualityFormat.contentLength;
        const bitrate = lowestQualityFormat.audioBitrate; // Storing bitrate in case we need it later
        const fileName = `${videoId}.${fileExtension}`;

        const bucket = admin.storage().bucket();
        const file = bucket.file(fileName);

        const audioStream = ytdl(videoUrl, { quality: lowestQualityFormat.itag });
        const firebaseStream = file.createWriteStream({
            metadata: {
                contentType: lowestQualityFormat.mimeType,
            },
        });

        let logInterval = contentLength/5; // TOTAL_LOG_LINES;
        let nextLogPoint = logInterval;
        let totalBytesReceived = 0;
        let isStreamError = false;

        audioStream.on('data', (chunk) => {
            totalBytesReceived += chunk.length;
            if (totalBytesReceived >= nextLogPoint) {
                console.log(`Received ${totalBytesReceived} bytes of audio data out of ${contentLength} bytes total`);
                nextLogPoint += logInterval;
            }
        }).on('error', (streamError) => {
            console.error(`Error in audio stream for ${videoId}:`, streamError);
            isStreamError = true;
            if (!responseSent) {
                res.status(500).send('Error in audio stream');
                responseSent = true;
            }
        }).on('end', () => {
            if (isStreamError) {
                console.log('Audio stream ended with errors.');
            } else {
                console.log('Audio stream ended successfully.');
            }
        });

        firebaseStream.on('error', (err) => {
            console.error('Error uploading to Firebase Cloud Storage', err);
            isStreamError = true;
            if (!responseSent) {
                res.status(500).send('Error uploading audio');
                responseSent = true;
            }
        });

        audioStream.pipe(firebaseStream)
            .on('finish', async () => {
                if (isStreamError) {
                    return;
                }
                console.log('Upload complete:', fileName  );

                try {
                    await file.makePublic();
                    const publicUrl = file.publicUrl();
                    console.log('File is now public:', publicUrl);
                    
                    const metadata = await file.getMetadata();

                    // Consolidated log statement for file details
                    console.log(`File Details:
                        Name: ${metadata[0].name}
                        Bucket: ${metadata[0].bucket}
                        Size: ${metadata[0].size} bytes
                        MD5 Hash: ${metadata[0].md5Hash}
                        Content Type: ${metadata[0].contentType}
                        Created: ${metadata[0].timeCreated}
                        Updated: ${metadata[0].updated}
                        Bitrate: ${bitrate} kbps`);
                    
                    if (!responseSent) {
                        res.status(200).send({
                            audio_url: publicUrl,
                            type: `audio/${fileExtension}`,
                            length_seconds: lengthSeconds,
                            file_size: metadata[0].size
                        });
                        responseSent = true;
                    }
                } catch (publicError) {
                    console.error('Error making file public:', publicError);
                    if (!responseSent) {
                        res.status(500).send('Error making file public');  
                        responseSent = true; 
                    }
                }
            });

    } catch (error) {
        console.error(`Error in YouTube audio extraction function: `, error);
        if (!responseSent) {
            res.status(500).send('Internal Server Error');
            responseSent = true;
        }
    }
});
