import { Capacitor, registerPlugin } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";
interface NativeFileInfo {
  id: string;
  name: string;
  size: number;
  createdAt: string;
  type: string;
  uri: string;
}
interface NativeFilesPlugin {
  exportFile(options: {
    id: string;
    name: string;
    type: string;
  }): Promise<void>;
  list(): Promise<{ files: NativeFileInfo[] }>;
  info(options: { id: string }): Promise<NativeFileInfo>;
  begin(options: {
    id: string;
    name: string;
    type: string;
    createdAt: string;
  }): Promise<void>;
  append(options: { id: string; data: string }): Promise<void>;
  commit(options: { id: string }): Promise<void>;
  abort(options: { id: string }): Promise<void>;
  remove(options: { id: string }): Promise<void>;
  estimate(): Promise<{ usage: number; quota: number }>;
  download(options: {
    id: string;
    name: string;
    url: string;
    kind: "pdf" | "video";
  }): Promise<{ size: number }>;
  addListener(
    event: "downloadProgress",
    callback: (event: { id: string; loaded: number; total: number }) => void,
  ): Promise<PluginListenerHandle>;
}
export const NativeFiles = registerPlugin<NativeFilesPlugin>("StudyFiles");
export const hasNativeFiles = () =>
  Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("StudyFiles");
export const nativeFileUrl = (uri: string) => Capacitor.convertFileSrc(uri);
