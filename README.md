# MiraBox StreamDock reverse-engineer

The MiraBox StreamDock has semi-oss drivers that have the USB HID logic inside a pre-compiled library. Out of curiousity, I reverse engineered the USB packets and wrote this demo to show how one might control the device directly without the official drivers.

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
