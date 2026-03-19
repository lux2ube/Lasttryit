declare module "dom-to-image-more" {
  interface Options {
    scale?: number;
    width?: number;
    height?: number;
    bgcolor?: string;
    style?: Partial<CSSStyleDeclaration>;
    filter?: (node: Node) => boolean;
    quality?: number;
  }
  const domtoimage: {
    toBlob(node: Node, options?: Options): Promise<Blob>;
    toPng(node: Node, options?: Options): Promise<string>;
    toJpeg(node: Node, options?: Options): Promise<string>;
    toSvg(node: Node, options?: Options): Promise<string>;
    toPixelData(node: Node, options?: Options): Promise<Uint8ClampedArray>;
  };
  export default domtoimage;
}
