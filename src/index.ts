import path from "path";
import * as usb from "usb";
import { StreamDock } from "./streamdock";

const VID = 0x5500;
const PID = 0x1001;

const imagesPath = path.join(process.cwd(), "images");

async function main() {
  const device = usb.findByIds(VID, PID);
  if (!device) {
    console.error("Device not found");
    return;
  }
  device.open();

  const iface = device.interfaces?.[0];
  if (!iface) {
    console.error("Interface not found");
    return;
  }

  if (iface.isKernelDriverActive()) {
    iface.detachKernelDriver();
  }

  iface.claim();
  console.log("Interface claimed");

  const inEndpoint: usb.InEndpoint = iface.endpoints?.find((ep) => ep.direction === "in") as usb.InEndpoint;
  const outEndpoint: usb.OutEndpoint = iface.endpoints?.find((ep) => ep.direction === "out") as usb.OutEndpoint;

  if (!inEndpoint || !outEndpoint) {
    console.error("Endpoints not found");
    return;
  }

  outEndpoint.transferType = usb.usb.LIBUSB_TRANSFER_TYPE_INTERRUPT;
  inEndpoint.transferType = usb.usb.LIBUSB_TRANSFER_TYPE_INTERRUPT;

  const sd = new StreamDock({
    send(data: Buffer) {
      return new Promise<void>((resolve, reject) => {
        outEndpoint.transfer(data, (error) => {
          if (error) {
            console.error("Error sending data", error);
            reject();
            return;
          }
          resolve();
        });
      });
    },
    receive(byteSize = 512) {
      return new Promise<Buffer>((resolve, reject) => {
        inEndpoint.transfer(byteSize, (error, data) => {
          if (error) {
            console.error("Error reading data", error);
            reject();
            return;
          }
          resolve(data ?? Buffer.alloc(0));
        });
      });
    },
    controlTransfer(bmRequestType: number, bRequest: number, wValue: number, wIndex: number, wLength: number) {
      return new Promise<Buffer | number | undefined>((resolve, reject) => {
        device.controlTransfer(bmRequestType, bRequest, wValue, wIndex, wLength, (error, data) => {
          if (error) {
            console.error("Error reading data", error);
            reject();
            return;
          }
          resolve(data);
        });
      });
    },
  });

  console.log(await sd.getFirmwareVersion());
  await sd.wakeScreen();
  await sd.clearScreen();
  await sd.setBrightness(0x19);

  // await sd.setBootImage(path.join(imagesPath, "logo.jpg"));

  const fillScreen = async () => {
    for (let i = 1; i < 16; i++) {
      await sd.setKeyImage(i, path.join(imagesPath, "test1.png"));
    }
  };

  await fillScreen();

  while (true) {
    const { keyId, state } = await sd.receiveKeyPress();
    console.log("Key", keyId, "state", state);
    await sd.setKeyImage(keyId, path.join(imagesPath, state ? "test2.png" : "test1.png"));
  }
}

main().catch(console.error);
