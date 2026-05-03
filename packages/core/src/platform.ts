// Adapter interfaces — concrete implementations live in adapter-* packages.
// 詳細: ../../../Documentation/ScenarioEditor/12_architecture.md §1, §2

export type ProjectHandle = Readonly<{
  id: string;
  name: string;
}>;

export interface FileSystemAdapter {
  list(handle: ProjectHandle, glob: string): Promise<readonly string[]>;
  read(handle: ProjectHandle, path: string): Promise<string>;
  write(handle: ProjectHandle, path: string, data: string): Promise<void>;
  delete(handle: ProjectHandle, path: string): Promise<void>;
  watch(handle: ProjectHandle, onChange: (path: string) => void): () => void;
}
