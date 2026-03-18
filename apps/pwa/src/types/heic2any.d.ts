declare module 'heic2any' {
  interface Options {
    blob: Blob;
    multiple?: true;
    toType?: string;
    quality?: number;
    gifInterval?: number;
  }
  export default function heic2any(options: Options): Promise<Blob | Blob[]>;
}
