# MiraBox StreamDock reverse-engineer

The MiraBox StreamDock has semi-oss drivers that have the USB HID logic inside a pre-compiled library. Out of curiousity, I reverse engineered the USB packets and wrote this demo to show how one might control the device directly without the official drivers.

![MiraBox StreamDock running this demo](https://github.com/user-attachments/assets/f2c56dfb-0cb7-40cc-9816-999c73a06d31)

This is just an experiment, and possibly has some bugs, and potential for improvements.

## Supported Functions

- read firmware version
- wake screen
- clear screen
- refresh
- set brightness
- set key image
- set boot image
- receive key presses

> **Note:** Only tested on **MiraBox 293**.

## API

```ts
import { StreamDock, USBBackend } from "./streamdock";

interface USBBackend {
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

const backend: USBBackend;
const sd = new StreamDock(backend);

console.log(await sd.getFirmwareVersion());
await sd.wakeScreen();
await sd.clearScreen();
await sd.setBrightness(0x19);
await sd.setKeyImage(i, path.join(process.cwd(), "test1.png"));
await sd.setBootImage(path.join(process.cwd(), "logo.jpg"));

while (true) {
  const { keyId, state } = await sd.receiveKeyPress();
  console.log("Key", keyId, "state", state);
}
```

See [Main Demo](./src/index.ts) for a concrete example.

## Run the repo

1. clone
1. `npm install`
1. `npm start`

> **Note**: on macos, I need to run `sudo npm start` to be able to access the usb HID device.
