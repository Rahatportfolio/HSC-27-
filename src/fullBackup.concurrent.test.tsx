// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { PlannerContextValue, ConfirmRequest } from "./context";
import type { stageMediaRestore } from "./mediaBackup";
import { freshData } from "./planner";
const state = vi.hoisted(() => ({
  ctx: null as unknown as PlannerContextValue,
  confirm: vi.fn<(request: ConfirmRequest) => void>(),
  stage: vi.fn(),
  save: vi.fn(),
  notify: vi.fn(),
}));
vi.mock("./context", () => ({ usePlanner: () => state.ctx }));
vi.mock("./storage", () => ({ saveData: state.save }));
vi.mock("./mediaBackup", () => ({
  inspectMediaBackup: vi.fn(async () => ({ data: {}, files: [] })),
  stageMediaRestore: state.stage,
  createMediaBackup: vi.fn(),
  saveBackupBlob: vi.fn(),
}));
import FullBackup from "./components/FullBackup";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("keeps new study progress and removes staged media when data changes during a full restore", async () => {
  const original = freshData();
  const setData = vi.fn();
  const rollback = vi.fn(async () => {});
  let finish!: (result: Awaited<ReturnType<typeof stageMediaRestore>>) => void;
  state.stage.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  state.ctx = {
    data: original,
    setData,
    confirm: state.confirm,
    notify: state.notify,
    timer: { reset: vi.fn() },
  } as unknown as PlannerContextValue;
  const view = render(<FullBackup />);
  fireEvent.change(view.container.querySelector("input[type=file]")!, {
    target: { files: [new File(["archive"], "backup.prostuti")] },
  });
  await waitFor(() => expect(state.confirm).toHaveBeenCalled());
  await act(async () => {
    state.confirm.mock.calls[0][0].action();
  });
  await waitFor(() => expect(state.stage).toHaveBeenCalled());
  state.ctx = {
    ...state.ctx,
    data: {
      ...original,
      notes: { important: "New note written while restore was running" },
    },
  };
  view.rerender(<FullBackup />);
  await act(async () => finish({ data: freshData(), rollback }));
  await waitFor(() => expect(rollback).toHaveBeenCalled());
  expect(state.save).not.toHaveBeenCalled();
  expect(setData).not.toHaveBeenCalled();
  expect(state.notify).toHaveBeenCalledWith(
    expect.stringContaining("New progress was kept"),
    "error",
  );
});
