const functions = require('firebase-functions');
const admin = require('firebase-admin');
const ytdl = require('ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const os = require('os');

admin.initializeApp();

// Fetch API key from environment
const apiKey = functions.config().myapi.key;

exports.videoIdToMP4 = functions.https.onRequest(async (req, res) => {
    const providedApiKey = req.headers['x-api-key'];

    if (providedApiKey !== apiKey) {
        res.status(401).send('Unauthorized');
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
    }

    const videoId = req.body.videoID;
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const audioPath = path.join(os.tmpdir(), `${videoId}.mp3`);
    const videoPath = path.join(os.tmpdir(), `${videoId}.mp4`);

    try {
        let hasVideo = true;
        
        await new Promise((resolve, reject) => {
            ytdl(videoUrl, { filter: format => format.container === 'mp4' && format.hasAudio })
                .pipe(ffmpeg())
                .output(videoPath)
                .output(audioPath)
                .on('end', resolve)
                .on('error', reject);
        });

        const bucket = admin.storage().bucket();
        const audioFile = bucket.file(`${videoId}.mp3`);
        const videoFile = bucket.file(`${videoId}.mp4`);

        if (hasVideo) {
            await bucket.upload(videoPath, {
                destination: videoFile.name,
                metadata: {
                    contentType: 'video/mp4',
                },
            });
            await videoFile.makePublic();
            const publicUrl = videoFile.publicUrl();
            res.status(200).send({ url: publicUrl, type: 'video/mp4' });
        } else {
            await bucket.upload(audioPath, {
                destination: audioFile.name,
                metadata: {
                    contentType: 'audio/mp3',
                },
            });
            await audioFile.makePublic();
            const publicUrl = audioFile.publicUrl();
            res.status(200).send({ url: publicUrl, type: 'audio/mp3' });
        }
        
    } catch (error) {
        console.error('Error processing video:', error);
        res.status(500).send('Internal Server Error');
    }
});
