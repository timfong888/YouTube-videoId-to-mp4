const functions = require('firebase-functions');
const admin = require('firebase-admin');
const ytdl = require('ytdl-core');

admin.initializeApp();

exports.videoIdToMP4 = functions.https.onRequest(async (req, res) => {
    const apiKey = functions.config().myapi.key;
    let responseSent = false;

    // Check for API key in headers
    const providedApiKey = req.headers['x-api-key'];
    if (providedApiKey !== apiKey) {
        res.status(401).send('Unauthorized');
        return;
    }

    // Check request method
    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
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
            return;
        }

        // Select the audio format with the lowest bitrate
        const lowestQualityFormat = audioFormats.sort((a, b) => a.audioBitrate - b.audioBitrate)[0];
        const fileExtension = lowestQualityFormat.container;
        const contentLength = lowestQualityFormat.contentLength;
        const fileName = `${videoId}.${fileExtension}`;

        console.log(`Downloading audio from ${videoId} to ${fileName} of contentLength ${contentLength} via ${lowestQualityFormat.url}`);

        // Reference to your Firebase Cloud Storage bucket
        const bucket = admin.storage().bucket();

        // Create a file reference
        const file = bucket.file(fileName);

        // Create a stream using ytdl-core
        const audioStream = ytdl(videoUrl, { quality: lowestQualityFormat.itag });
        const firebaseStream = file.createWriteStream({
            metadata: {
                contentType: lowestQualityFormat.mimeType,
            },
        });

        const TOTAL_LOG_LINES = 5;
        let logInterval = contentLength // TOTAL_LOG_LINES;
        let nextLogPoint = logInterval;
        let totalBytesReceived = 0;

        // Add error handling and logging for the audio stream
        audioStream.on('data', (chunk) => {
            totalBytesReceived += chunk.length;
            if (totalBytesReceived >= nextLogPoint) {
                console.log(`Received ${totalBytesReceived} bytes of audio data out of ${contentLength} bytes total`);
                nextLogPoint += logInterval;
            }
        }).on('error', (streamError) => {
            console.error(`Error in audio stream for ${videoId}:`, streamError);
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
            if (!responseSent) {
                res.status(500).send('Error uploading audio');
                responseSent = true;
            }
        });

        let isStreamError = false;

        audioStream.on('error', (streamError) => {
            console.error(`Error in audio stream for ${videoId}:`, streamError);
            isStreamError = true;
            res.status(500).send('Error in audio stream');
        });

        firebaseStream.on('error', (err) => {
            console.error('Error uploading to Firebase Cloud Storage', err);
            isStreamError = true;
            res.status(500).send('Error uploading audio');
        });

        // Pipe the ytdl-core stream to Firebase Cloud Storage
        audioStream.pipe(firebaseStream)
            .on('error', (err) => {
                console.error('Error uploading to Firebase Cloud Storage', err);
                res.status(500).send('Error uploading audio');
            })
            .on('finish', async () => {
                console.log('Upload complete');
                try {
                    await file.makePublic();
                    const publicUrl = file.publicUrl();
                    console.log('File made public at URL:', publicUrl);

                    // Fetch file metadata to confirm file size
                    const metadata = await file.getMetadata();
                    console.log(`Uploaded file metadata for ${videoId}: 
                                Name: ${metadata[0].name}, 
                                Bucket: ${metadata[0].bucket}, 
                                Size: ${metadata[0].size} bytes, 
                                MD5 Hash: ${metadata[0].md5Hash}, 
                                Content Type: ${metadata[0].contentType}, 
                                Created: ${metadata[0].timeCreated}, 
                                Updated: ${metadata[0].updated}, 
                                Media Link: ${metadata[0].mediaLink}`);

                    if (!responseSent) {
                        res.status(200).send({
                            audio_url: publicUrl,
                            type: `audio/${fileExtension}`,
                            length_seconds: lengthSeconds,
                            file_size: metadata[0].size
                        });
                        responseSent = true;
                    };
                } catch (publicError) {
                    console.error('Error making file public:', publicError);
                    res.status(500).send('Error making file public');
                }
            });
    } catch (error) {
        console.error(`Error in YouTube audio extraction function: `, error);
        res.status(500).send('Internal Server Error');
    }
});
