# YouTube-videoId-to-mp4

Yes, that's exactly the repo you should reference. The code you shared is from the GitHub repository at https://github.com/timfong888/YouTube-videoId-to-mp4.

Let me update the documentation to include this reference and enhance it with the specific details from this code:

```markdown
# YouTube Audio Extraction (videoIdToMP4)

## Overview

The `videoIdToMP4` Cloud Function extracts audio from YouTube videos for our transcription pipeline. It takes a YouTube video ID, extracts the audio, and uploads it to Firebase Storage with a public URL for further processing.

## Source Repository

This function is maintained in a separate GitHub repository:
- **Repository**: [GitHub - timfong888/YouTube-videoId-to-mp4](https://github.com/timfong888/YouTube-videoId-to-mp4)
- **Main file**: `index.js`

## Technical Details

- **Type**: Firebase Cloud Function
- **Runtime**: Node.js 18 (needs update to Node.js 20 before April 30, 2025)
- **Memory**: 512MB
- **Timeout**: 540 seconds (9 minutes)
- **Storage**: Firebase Storage
- **Proxy**: SmartProxy (configured but commented out in current implementation)

## Dependencies

```json
{
  "dependencies": {
    "firebase-admin": "^x.x.x",
    "firebase-functions": "^x.x.x",
    "https-proxy-agent": "^x.x.x",
    "ytdl-core": "^x.x.x"
  },
  "engines": {
    "node": "18"
  }
}
```

## API Reference

### Endpoint
`https://us-central1-sophia-db784.cloudfunctions.net/videoIdToMP4`

### Authentication
Requires an API key passed in the `x-api-key` header, configured in Firebase:
```bash
firebase functions:config:set myapi.key="YOUR_API_KEY"
```

### Request Format
```json
{
  "videoId": "uywNk0Kku4E"
}
```

### Response Format
```json
{
  "audio_url": "https://storage.googleapis.com/sophia-db784.appspot.com/uywNk0Kku4E.mp3",
  "type": "audio/mp3",
  "length_seconds": 123,
  "file_size": 1234567,
  "transferred_bytes": 1234567
}
```

## Process Flow

```mermaid
graph TD
    A[Receive YouTube video ID] --> B[Extract video info with ytdl-core]
    B --> C[Select lowest quality audio format]
    C --> D[Stream audio to Firebase Storage]
    D --> E[Make file publicly accessible]
    E --> F[Return public URL and metadata]
```

## Implementation Details

### Audio Format Selection
The function selects the lowest quality audio format to minimize file size and processing time:
```javascript
const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
const lowestQualityFormat = audioFormats.sort((a, b) => a.audioBitrate - b.audioBitrate)[0];
```

### Streaming Implementation
The function uses Node.js streams to pipe data directly from YouTube to Firebase Storage:
```javascript
const audioStream = ytdl(videoUrl, { quality: lowestQualityFormat.itag });
const firebaseStream = file.createWriteStream({
    metadata: {
        contentType: lowestQualityFormat.mimeType,
    },
});
audioStream.pipe(firebaseStream);
```

### Progress Monitoring
The function logs progress at 20% intervals during download:
```javascript
let logInterval = contentLength/5;
let nextLogPoint = logInterval;
let totalBytesReceived = 0;

audioStream.on('data', (chunk) => {
    totalBytesReceived += chunk.length;
    if (totalBytesReceived >= nextLogPoint) {
        console.log(`Received ${totalBytesReceived} bytes of audio data out of ${contentLength} bytes total`);
        nextLogPoint += logInterval;
    }
});
```

## Error Handling

- **401**: Invalid or missing API key
- **404**: No audio formats available for this video
- **405**: Method not allowed (only POST is supported)
- **500**: Various internal errors (streaming, storage, etc.)

The function tracks response status with a `responseSent` flag to prevent sending multiple responses.

## Proxy Configuration

The function is configured to use SmartProxy, though the proxy usage is currently commented out:

```javascript
const proxyURL = 'https://spm8v50ymm:PCGu36goaJtvd25tlh@gate.smartproxy.com:7000';
const agent = new HttpsProxyAgent(proxyURL);

// Commented out in current implementation:
// const audioStream = ytdl(videoUrl, { quality: lowestQualityFormat.itag, requestOptions: { agent: agent } });
```

To enable proxy usage, uncomment the line with `requestOptions`.

## Update Instructions

To update the function to Node.js 20:

1. Clone the repository:
```bash
git clone https://github.com/timfong888/YouTube-videoId-to-mp4.git
cd YouTube-videoId-to-mp4
```

2. Update the Node.js runtime in `package.json`:
```json
{
  "engines": {
    "node": "20"
  }
}
```

3. Deploy with the updated runtime:
```bash
firebase deploy --only functions:videoIdToMP4
```

## Integration Examples

### FlutterFlow HTTP Request
```dart
Future<Map<String, dynamic>> extractAudioFromYouTube(String videoId) async {
  try {
    final response = await http.post(
      Uri.parse('https://us-central1-sophia-db784.cloudfunctions.net/videoIdToMP4'),
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'YOUR_API_KEY',
      },
      body: jsonEncode({'videoId': videoId}),
    );
    
    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    } else {
      throw 'Failed to extract audio: ${response.statusCode}';
    }
  } catch (e) {
    print('Error extracting audio: $e');
    rethrow;
  }
}
```

## Troubleshooting

### Common Issues

1. **YouTube API Restrictions**
   - YouTube occasionally changes their API, requiring updates to ytdl-core
   - Solution: Keep ytdl-core updated to the latest version

2. **Proxy Connection Issues**
   - If using the proxy and encountering connection problems
   - Solution: Verify proxy credentials and connectivity

3. **Storage Permission Errors**
   - Firebase Storage permissions may prevent file uploads or public access
   - Solution: Check IAM permissions for the Cloud Function service account

4. **Video Availability**
   - Some videos are region-restricted or not available for download
   - Solution: Verify video is publicly accessible from your region
```

This documentation now references the specific GitHub repository and includes more detailed information from the actual implementation. It should serve as a good starting point for your Obsidian documentation.
