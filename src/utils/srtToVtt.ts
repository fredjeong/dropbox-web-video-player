export function srtToVtt(srt: string): string {
  let vtt = 'WEBVTT\n\n';
  const lines = srt.replace(/\r\n/g, '\n').split('\n');
  let isTimeLine = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.includes('-->')) {
      vtt += line.replace(/,/g, '.') + '\n';
      isTimeLine = true;
    } else if (line.trim() === '') {
      vtt += '\n';
      isTimeLine = false;
    } else if (!isTimeLine && !isNaN(parseInt(line.trim()))) {
      // Skip the index number in SRT
      continue;
    } else {
      vtt += line + '\n';
    }
  }
  return vtt;
}
