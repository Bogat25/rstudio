declare module 'utif' {
  const UTIF: { decode(bytes: ArrayBuffer): any[]; decodeImage(bytes: ArrayBuffer, frame: any): void; toRGBA8(frame: any): Uint8Array };
  export default UTIF;
}
