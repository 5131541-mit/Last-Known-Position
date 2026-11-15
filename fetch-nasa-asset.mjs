const url = process.argv[2];
if (!url || !url.startsWith('https://')) {
  process.stderr.write('A fixed HTTPS asset URL is required.');
  process.exit(2);
}

try {
  const response = await fetch(url, {headers: {'User-Agent': 'LastKnownPosition/1.0'}});
  if (!response.ok) {
    process.stderr.write(`NASA asset request failed (${response.status}).`);
    process.exit(1);
  }
  const declaredLength = Number(response.headers.get('content-length') || 0);
  const limit = 50 * 1024 * 1024;
  if (declaredLength > limit) {
    process.stderr.write('NASA asset exceeds the 50 MiB response limit.');
    process.exit(1);
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > limit) {
      process.stderr.write('NASA asset exceeds the 50 MiB response limit.');
      process.exit(1);
    }
    chunks.push(chunk);
  }
  process.stdout.write(Buffer.concat(chunks, total));
} catch (error) {
  process.stderr.write(`NASA asset request failed: ${error.message}`);
  process.exit(1);
}
