import '@expo/browser-polyfill';

import * as filters from 'pixi-filters';
import * as PixiInstance from 'pixi.js';
import { Image, Platform } from 'react-native';
import { resolveAsync } from 'expo-asset-utils';

global.PIXI = global.PIXI || PixiInstance;
let { PIXI } = global;
PIXI.filters = { ...(PIXI.filters || {}), ...filters };

class ExpoPIXIApplication extends PIXI.Application {
  constructor({ width, height, scale, backgroundColor, context, ...props }) {
    if (!context) {
      throw new Error(
        'expo-pixi: new Application({ context: null }): context must be a valid WebGL context.'
      );
    }

    if (Platform.OS !== 'web') {
      // Shim stencil buffer attribute
      const getAttributes = context.getContextAttributes || (() => ({}));
      context.getContextAttributes = () => {
        const contextAttributes = getAttributes();
        return {
          ...contextAttributes,
          stencil: true,
        };
      };
    }

    const resolution = scale || 1; // PixelRatio.get();
    super({
      context,
      resolution,
      width: width || context.drawingBufferWidth / resolution,
      height: height || context.drawingBufferHeight / resolution,
      backgroundColor,
      ...props,
    });
    this.ticker.add(() => context.endFrameEXP());
  }
}

const isAsset = input =>
  input &&
  typeof input.width === 'number' &&
  typeof input.height === 'number' &&
  typeof input.localUri === 'string';

const isImageType = type => /^(jpeg|jpg|gif|png|bmp|webp|heic)$/i.test(type);

const isImage = uri => uri && isImageType(uri.split('.').pop());

const hasSizes = asset =>
  typeof asset.width === 'number' && typeof asset.height === 'number';

const requestImageSizes = async uri =>
  new Promise(resolve => {
    Image.getSize(
      uri,
      (width, height) => {
        resolve({ width, height });
      },
      () => {
        resolve({ width: null, height: null });
      }
    );
  });

const noop = () => {
  /* empty */
};

function removeAllHandlers(tex) {
  Object.assign(tex, {
    destroy: noop,
    on: noop,
    once: noop,
    emit: noop,
  });
}

const getTextureAssetAsync = async resource => {
  let asset = resource;
  if (Platform.OS !== 'web') {
    asset = await resolveAsync(resource);
    if (isImage(asset.localUri || asset.uri) && !hasSizes(asset)) {
      const { width, height } = await requestImageSizes(
        asset.localUri || asset.uri
      );
      asset.width = width;
      asset.height = height;
    }
  }

  return asset;
};

if (!(PIXI.Application instanceof ExpoPIXIApplication)) {
  const { HTMLImageElement } = global;

  const whiteTexture = () => {
    const width = 16;
    const height = 16;
    const buffer = new Uint8Array(width * height * 4);
    buffer.fill(255, 0);
    return PIXI.Texture.fromBuffer(buffer, width, height);
  };

  const textureFromExpoAsync = async (resource, options, strict) => {
    const asset = await getTextureAssetAsync(resource);
    return PIXI.Texture.from(asset, options, strict);
  };

  const baseTextureFromExpoAsync = async (resource, options, strict) => {
    const asset = await getTextureAssetAsync(resource);
    return PIXI.BaseTexture.from(asset, options, strict);
  };

  const spriteFromExpoAsync = async resource => {
    const texture = await textureFromExpoAsync(resource);
    return PIXI.Sprite.from(texture);
  };

  const originalSpriteFrom = PIXI.Sprite.from;
  const originalTextureFrom = PIXI.Texture.from;
  const originalBaseTextureFrom = PIXI.BaseTexture.from;

  PIXI.Application = ExpoPIXIApplication;

  // Base texture
  PIXI.BaseTexture.from = (...props) => {
    if (Platform.OS === 'web') {
      return originalBaseTextureFrom(...props);
    }
    if (props.length && props[0]) {
      const asset = props[0];
      if (isAsset(asset)) {
        if (asset instanceof HTMLImageElement) {
          return originalBaseTextureFrom(...props);
        }
        return originalBaseTextureFrom(
          new HTMLImageElement(asset),
          ...props.slice(1)
        );
      }
      if (typeof asset === 'string' || typeof asset === 'number') {
        console.warn(
          `PIXI.BaseTexture.from(asset: ${typeof asset}) is not supported. Returning a Promise!`
        );
        return baseTextureFromExpoAsync(...props);
      }
    }
    return originalBaseTextureFrom(...props);
  };
  PIXI.BaseTexture.fromExpoAsync = baseTextureFromExpoAsync;

  // Texture
  PIXI.Texture.from = (...props) => {
    if (Platform.OS === 'web') {
      return originalTextureFrom(...props);
    }
    if (props.length && props[0]) {
      const asset = props[0];
      if (isAsset(asset)) {
        if (asset instanceof HTMLImageElement) {
          return originalTextureFrom(...props);
        }
        return originalTextureFrom(
          new HTMLImageElement(asset),
          ...props.slice(1)
        );
      }
      if (typeof asset === 'string' || typeof asset === 'number') {
        console.warn(
          `PIXI.Texture.from(asset: ${typeof asset}) is not supported. Returning a Promise!`
        );
        return textureFromExpoAsync(...props);
      }
    }
    return originalTextureFrom(...props);
  };
  PIXI.Texture.fromExpoAsync = textureFromExpoAsync;
  PIXI.Texture.WHITE = whiteTexture();

  // Sprite
  PIXI.Sprite.fromExpoAsync = spriteFromExpoAsync;
  PIXI.Sprite.from = (...props) => {
    if (Platform.OS === 'web') {
      return originalSpriteFrom(...props);
    }
    if (props.length && props[0]) {
      const asset = props[0];
      if (isAsset(asset)) {
        const image = new HTMLImageElement(asset);
        return originalSpriteFrom(image);
      }
      if (typeof asset === 'string' || typeof asset === 'number') {
        console.warn(
          `PIXI.Sprite.from(asset: ${typeof asset}) is not supported. Returning a Promise!`
        );
        return spriteFromExpoAsync(asset);
      }
    }

    return originalSpriteFrom(...props);
  };
}

removeAllHandlers(PIXI.Texture.WHITE);
removeAllHandlers(PIXI.Texture.WHITE.baseTexture);

export default PIXI;
