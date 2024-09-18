import { readFile } from "fs/promises";
import { intToRGBA, Jimp } from "jimp";

function sizeBytes(size: number, bytes = 4) {
  const sizeBytes = size.toString(16).padStart(bytes * 2, "0");
  return Buffer.from(sizeBytes, "hex");
}

export interface USBBackend {
  send(data: Buffer): Promise<void>;
  receive(byteSize?: number): Promise<Buffer>;
  controlTransfer(
    bmRequestType: number,
    bRequest: number,
    wValue: number,
    wIndex: number,
    wLength: number
  ): Promise<Buffer | number | undefined>;
}

class SimpleMutex {
  private mutex = false;
  private _unlock?: () => void;
  private _currentPromise?: Promise<void>;

  async lock() {
    if (this.mutex) {
      await this._currentPromise;
    }
    this.mutex = true;
    this._currentPromise = new Promise((resolve) => (this._unlock = resolve));
  }

  unlock() {
    this.mutex = false;
    this._unlock?.();
  }
}

export class StreamDock {
  private static CMD_PREFIX = [0x43, 0x52, 0x54, 0x00, 0x00];
  private static CRT_LIG = (value: number) => [0x4c, 0x49, 0x47, 0x00, 0x00, value];
  private static CRT_CLE = (target: number) => [0x43, 0x4c, 0x45, 0x00, 0x00, 0x00, target];
  private static CRT_DIS = () => [0x44, 0x49, 0x53, 0x00, 0x00];
  private static CRT_STP = () => [0x53, 0x54, 0x50, 0x00, 0x00];
  private static CRT_BAT = (size: number, keyId: number) => [0x42, 0x41, 0x54, ...sizeBytes(size, 4), keyId];
  private static CRT_LOG = () => [0x4c, 0x4f, 0x47, 0x00, 0x11, 0x94, 0x00, 0x01];
  private static KEY_MAP = {
    0x1: 0x0b,
    0x2: 0x0c,
    0x3: 0x0d,
    0x4: 0x0e,
    0x5: 0x0f,
    0x6: 0x06,
    0x7: 0x07,
    0x8: 0x08,
    0x9: 0x09,
    0xa: 0x0a,
    0xb: 0x01,
    0xc: 0x02,
    0xd: 0x03,
    0xe: 0x04,
    0xf: 0x05,
  };

  private static packetSize = 512;

  private mutex = new SimpleMutex();

  private backend: USBBackend;
  constructor(backend: USBBackend) {
    this.backend = backend;
  }

  async receive() {
    return this.backend.receive();
  }

  async send(data: Buffer | Array<number>, prefix = StreamDock.CMD_PREFIX) {
    await this.mutex.lock();
    if (!Buffer.isBuffer(data)) {
      data = Buffer.from(data);
    }

    if (data.length < StreamDock.packetSize) {
      // pad with zeros to fill the packet.
      data = Buffer.concat([data, Buffer.alloc(512 - data.length)]);
    }

    await this.backend.send(Buffer.from([...prefix, ...data]));
    this.mutex.unlock();
  }

  async getFirmwareVersion() {
    const data = await this.backend.controlTransfer(0xa1, 0x01, 0x0100, 0, 512);

    if (!Buffer.isBuffer(data)) {
      console.error("Invalid firmware version data");
      return;
    }

    return data.toString("utf-8");
  }

  async sendBytes(data: Buffer | Array<number>, chunkSize = StreamDock.packetSize) {
    if (!Buffer.isBuffer(data)) {
      data = Buffer.from(data);
    }

    let offset = 0;
    while (offset < data.length) {
      const max = Math.min(offset + chunkSize, data.length);
      const chunk = data.subarray(offset, max);

      await this.send(chunk, []);

      offset += chunkSize;
    }
  }

  async wakeScreen() {
    await this.send(StreamDock.CRT_DIS());
  }

  async clearScreen() {
    await this.send(StreamDock.CRT_CLE(0xff));
  }

  async refresh() {
    await this.send(StreamDock.CRT_STP());
  }

  async setBrightness(value: number) {
    await this.send(StreamDock.CRT_LIG(value));
  }

  private getImageBuffer(image: string | Buffer) {
    if (typeof image === "string") {
      return readFile(image);
    }
    return image;
  }

  async setKeyImage(key: number, image: string | Buffer) {
    const imgBuffer = await this.getImageBuffer(image);
    const img = (await Jimp.fromBuffer(imgBuffer))
      .resize({
        w: 100,
        h: 100,
      })
      .rotate(180);

    const imgData = await img.getBuffer("image/jpeg", {
      quality: 100,
    });

    await this.send(StreamDock.CRT_BAT(imgData.length, key));
    await this.sendBytes(imgData);
    await this.refresh();
  }

  async clearKeyImage(key: number) {
    await this.send(StreamDock.CRT_CLE(key));
  }

  async receiveKeyPress() {
    const res = await this.receive();

    return {
      keyId: StreamDock.KEY_MAP[res[9] as keyof typeof StreamDock.KEY_MAP],
      state: res[10],
    };
  }

  async setBootImage(image: string | Buffer) {
    const imgBuffer = await this.getImageBuffer(image);
    const img = (await Jimp.fromBuffer(imgBuffer))
      .resize({
        w: 800,
        h: 480,
      })
      .rotate(180);

    const imgData = Buffer.alloc(800 * 480 * 3);
    img.scan((x, y) => {
      const color = intToRGBA(img.getPixelColor(x, y));
      const pixelIndex = (y * img.bitmap.width + x) * 3;

      imgData[pixelIndex] = color.b;
      imgData[pixelIndex + 1] = color.g;
      imgData[pixelIndex + 2] = color.r;
    });

    await this.send(StreamDock.CRT_LOG());
    await this.sendBytes(imgData);
    await this.refresh();
  }
}
