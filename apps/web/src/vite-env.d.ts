/// <reference types="vite/client" />

declare module '@mapbox/mapbox-gl-draw' {
  import type { IControl } from 'mapbox-gl';

  interface DrawOptions {
    displayControlsDefault?: boolean;
    controls?: {
      point?: boolean;
      line_string?: boolean;
      polygon?: boolean;
      trash?: boolean;
      combine_features?: boolean;
      uncombine_features?: boolean;
    };
    defaultMode?: string;
  }

  class MapboxDraw implements IControl {
    constructor(options?: DrawOptions);
    onAdd(map: mapboxgl.Map): HTMLElement;
    onRemove(map: mapboxgl.Map): void;
    add(geojson: GeoJSON.Feature | GeoJSON.FeatureCollection): string[];
    getAll(): GeoJSON.FeatureCollection;
    delete(ids: string | string[]): this;
    deleteAll(): this;
    set(featureCollection: GeoJSON.FeatureCollection): string[];
    get(id: string): GeoJSON.Feature | undefined;
    getSelectedIds(): string[];
    changeMode(mode: string, options?: object): this;
    trash(): this;
    getMode(): string;
  }

  export default MapboxDraw;
}
