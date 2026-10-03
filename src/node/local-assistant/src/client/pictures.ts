import UTIF from 'utif';
import { Picture } from '../shared/chat';

export async function picture(file: File): Promise<Picture> {
  if (file.size > 100 * 1024 * 1024) throw new Error('The picture file is too large.');
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d')!;
  let source: CanvasImageSource;
  let width: number; let height: number;
  let bitmap: ImageBitmap | undefined;
  if (/\.tiff?$/i.test(file.name) || /image\/tiff/i.test(file.type)) {
    const bytes = await file.arrayBuffer(); const frames = UTIF.decode(bytes);
    const frame = frames[0]; if (!frame) throw new Error('The TIFF contains no picture.');
    const w = frame.t256?.[0]; const h = frame.t257?.[0];
    if (!w || !h || w * h > 50000000) throw new Error('The TIFF dimensions are unsupported.');
    UTIF.decodeImage(bytes, frame);
    const raw = document.createElement('canvas'); raw.width = frame.width; raw.height = frame.height;
    raw.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(UTIF.toRGBA8(frame)), frame.width, frame.height), 0, 0);
    const orientation = frame.t274?.[0] ?? 1;
    const upright = document.createElement('canvas');
    upright.width = orientation >= 5 ? raw.height : raw.width;
    upright.height = orientation >= 5 ? raw.width : raw.height;
    const ctx = upright.getContext('2d')!;
    const transforms: Record<number, number[]> = { 2: [-1,0,0,1,raw.width,0], 3: [-1,0,0,-1,raw.width,raw.height],
      4: [1,0,0,-1,0,raw.height], 5: [0,1,1,0,0,0], 6: [0,1,-1,0,raw.height,0],
      7: [0,-1,-1,0,raw.height,raw.width], 8: [0,-1,1,0,0,raw.width] };
    if (transforms[orientation]) ctx.setTransform(...transforms[orientation] as [number,number,number,number,number,number]);
    ctx.drawImage(raw, 0, 0); source = upright; width = upright.width; height = upright.height;
  } else {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    source = bitmap; width = bitmap.width; height = bitmap.height;
  }
  try {
    const scale = Math.min(1, 1600 / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    let url = canvas.toDataURL('image/png');
    if ((url.length - url.indexOf(',') - 1) * 0.75 > 1200000) {
      context.globalCompositeOperation = 'destination-over'; context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
      url = canvas.toDataURL('image/jpeg', 0.85);
    }
    return { name: file.name || 'Pasted picture', url };
  } finally { bitmap?.close(); }
}
