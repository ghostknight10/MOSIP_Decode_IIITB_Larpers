/// <reference types="vite/client" />

// @mosip/pixelpass ships plain JavaScript without types.
declare module '@mosip/pixelpass' {
  export function generateQRData(data: string, header?: string): string;
  export function generateQRCode(data: string, ecc?: string, header?: string): Promise<string>;
  export function decode(data: string): string;
}
