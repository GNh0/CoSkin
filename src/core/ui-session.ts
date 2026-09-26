export type Page = "library" | "detail";
export type SessionView =
  | { kind: "codex"; returnPage: Page }
  | { kind: "page"; page: Page }
  | { kind: "preview"; returnPage: Page }
  | { kind: "editing"; returnPage: Page };
export class UiSession {
  view: SessionView = { kind: "codex", returnPage: "library" };
  get page(): Page {
    return this.view.kind === "page" ? this.view.page : this.view.returnPage;
  }
  get editing(): boolean {
    return this.view.kind === "editing";
  }
  get previewing(): boolean {
    return this.view.kind === "preview";
  }
  show(page: Page = this.page): void {
    this.view = { kind: "page", page };
  }
  hide(): void {
    this.view = { kind: "codex", returnPage: this.page };
  }
  preview(): void {
    this.view = { kind: "preview", returnPage: this.page };
  }
  edit(): void {
    this.view = { kind: "editing", returnPage: this.page };
  }
  finish(): void {
    this.show();
  }
}
