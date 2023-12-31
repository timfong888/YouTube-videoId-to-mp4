const functions = require('firebase-functions');
const admin = require('firebase-admin');
const ytdl = require('ytdl-core');
const { HttpsProxyAgent } = require('https-proxy-agent');

const proxyURL = 'https://spm8v50ymm:PCGu36goaJtvd25tlh@gate.smartproxy.com:7000';

// Create an options object for the HttpsProxyAgent
const agentOptions = {
    host: 'gate.smartproxy.com',
    port: 7000,
    protocol: 'https',
    auth: 'spm8v50ymm:PCGu36goaJtvd25tlh',

    // TLS protocol settings
    secureProtocol: 'TLSv1_2_method', // Use TLS 1.2
    // For TLS 1.3, use 'TLSv1_3_method' (ensure Node.js version compatibility)
};

//const agent = new HttpsProxyAgent(agentOptions);

// Create an agent with the proxy URL
const agent = new HttpsProxyAgent(proxyURL);

console.log('agent:', agent);


admin.initializeApp();

exports.videoIdToMP4 = functions
    // Increased memory, decreased timeout (compared to defaults)
    .runWith({ memory: '512MB', timeoutSeconds: 540 })
    .https
    .onRequest(async (req, res) => {
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
            log.error(`No audio formats for ${videoId}`);
            res.status(404).send('No audio formats available for this video');
            responseSent = true;
            return;
        }

        const lowestQualityFormat = audioFormats.sort((a, b) => a.audioBitrate - b.audioBitrate)[0];
        console.log(`lowestQualityFormat:`, lowestQualityFormat);

        const fileExtension = lowestQualityFormat.container;
        const contentLength = lowestQualityFormat.contentLength;
        const bitrate = lowestQualityFormat.audioBitrate; // Storing bitrate in case we need it later
        const approxDurationMs = lowestQualityFormat.approxDurationMs; 
        const fileName = `${videoId}.${fileExtension}`;

        const bucket = admin.storage().bucket();
        const file = bucket.file(fileName);

        const audioStream = ytdl(videoUrl, { quality: lowestQualityFormat.itag });
        // const audioStream = ytdl(videoUrl, { quality: lowestQualityFormat.itag, requestOptions: { agent: agent } });

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
            /*
            if (!responseSent) {
                res.status(500).send(`Error in audio stream`, streamError);
                responseSent = true;
            }
            */
        }).on('end', () => {
            if (isStreamError) {
                console.log(`Audio stream ended with errors. ${videoId}`);
            } else {
                console.log(`Audio stream ended successfully:`, videoId);
            }
        });

        firebaseStream.on('error', (err) => {
            console.error('Error uploading to Firebase Cloud Storage', err);
            isStreamError = true;
            if (!responseSent) {
                res.status(500).send(`Error uploading audio ${videoId}`, err);
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

                    console.log(`File Details for ${videoId}:
                        Name: ${metadata[0].name}
                        Bucket: ${metadata[0].bucket}
                        Size: ${metadata[0].size} bytes
                        MD5 Hash: ${metadata[0].md5Hash}
                        Content Type: ${metadata[0].contentType}
                        Total Bytes: ${totalBytesReceived}
                        Created: ${metadata[0].timeCreated}
                        Updated: ${metadata[0].updated}
                        approxDurationMs: ${approxDurationMs}
                        audio_url: ${publicUrl}
                        fileExtension: ${fileExtension}
                        length_seconds: ${lengthSeconds}
                        file_size: ${metadata[0].size}
                        transferred_bytes: ${totalBytesReceived}
                        Bitrate: ${bitrate} kbps`);
                    
                    if (!responseSent) {
                        res.status(200).send({
                            audio_url: publicUrl,
                            type: `audio/${fileExtension}`,
                            length_seconds: lengthSeconds,
                            file_size: metadata[0].size,
                            transferred_bytes: totalBytesReceived // include the total bytes received
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
        console.error(`Error in YouTube audio extraction function - ${videoId}: `, error);
        if (!responseSent) {
            res.status(500).send(`Internal Server Error - ${videoId}: `, error);
            responseSent = true;
        }
    }
});

/*
firebase deploy --only functions:videoIdToMP4
*/
