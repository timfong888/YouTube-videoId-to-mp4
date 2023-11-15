const functions = require('firebase-functions');
const admin = require('firebase-admin');
const ytdl = require('ytdl-core');
const path = require('path');
const os = require('os');
const fs = require('fs');  // Add this line for file system module

admin.initializeApp();

// Fetch API key from environment
const apiKey = functions.config().myapi.key;

exports.videoIdToMP4 = functions.https.onRequest(async (req, res) => {
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

    const audioPath = path.join(os.tmpdir(), `${videoId}.webm`); // returns the path to the operating system's default directory for temporary files. combines the temporary directory path with the desired filename.
    const audioWriteStream = fs.createWriteStream(audioPath); // is a method from Node.js's File System module (fs). It creates a writable stream in a very simple manner. 
                                                              // It opens the file located at audioPath for writing. If the file does not exist, it's created. If it does exist, it is truncated.
  
    console.info('videoId:', videoId);
    console.info('videoUrl:', videoUrl);

    try {
      const audioStream = ytdl(videoUrl, {
        filter: 'audioonly',
        quality: 'highestaudio',
      });
  
      // Listen to the 'data' event
      let totalBytes = 0;

      audioStream.on('data', (chunk) => {
        totalBytes += chunk.length;
        console.log(`Received ${chunk.length} bytes of data. Total received: ${totalBytes} bytes`);
      });

      // Pipe the audio data into the file we created earlier`
      audioStream.pipe(audioWriteStream);

      // It's a good practice to also listen to error events
      audioStream.on('error', error => {
        console.error(`Error in audioStream for video ID ${videoId}: `, error);
      });

      audioWriteStream.on('error', error => {
        console.error(`Error in audioWriteStream for video ID ${videoId}: `, error);
      });
  
      audioWriteStream.on('finish', async () => {
        console.info(`audioWriteStream finished for ${videoId}`);
        
        // Upload to Firebase Storage
        const bucket = admin.storage().bucket();
        const audioFile = bucket.file(`${videoId}.webm`);
  
        await bucket.upload(audioPath, {
          destination: audioFile.name,
          metadata: {
            contentType: 'audio/webm',  // Note the format
          },
        });
  
        await audioFile.makePublic();
        const publicUrl = audioFile.publicUrl();
        res.status(200).send({ audio_url: publicUrl, type: 'audio/webm' });  // Note the format
      });
    } catch (error) {
      console.error(`Error in YouTube audio extraction function for video ID ${videoId}: `, error);
      // Send an error response to the client
      res.status(500).send(`Internal Server Error for video ID ${videoId}`);
    }
  });

  //  firebase deploy --only functions:videoIdToMP4

  /*
  https://github.com/fent/node-ytdl-core/issues/1251#issuecomment-1709610029
  I fixed this issue by downgrading to 4.10.0 by using npm i ytdl-core@4.10.0
  https://github.com/fent/node-ytdl-core/issues/1262
  This fixed the timeout issue for me. I was using the latest version of ytdl-core (4.10.1) and used a forked version.
  */

  // firebase functions:config:get

