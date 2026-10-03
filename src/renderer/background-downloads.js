import { h } from "./components.js";
import { backgroundExportText } from "./background-export.js";

export function backgroundDownloadsPage(panel, section) {
  const label = backgroundExportText;
  const root = h("div", { class: "panel-page background-downloads" });
  const summary = h("p", { role: "status", "aria-live": "polite" });
  const error = h("p", { role: "alert", hidden: "" });
  const list = h("div", { class: "background-download-list" });
  const empty = h("p", { text: label("empty"), hidden: "" });
  const limit = h(
    "select",
    { "aria-label": label("limit") },
    [1, 2, 3, 4].map((value) =>
      h("option", { value: String(value), text: String(value) }),
    ),
  );
  const clear = h("button", { type: "button", text: label("clear") });
  const previous = h("button", { type: "button", text: label("previous") });
  const next = h("button", { type: "button", text: label("next") });
  const page = h("span");
  root.append(
    h("header", { class: "page-header" }, [
      h("h1", { text: label("downloads") }),
      panel.button(label("close"), () => {
        panel.downloadsOpen = false;
      }),
    ]),
    h("p", { text: label("downloadsHint") }),
    h("div", { class: "row" }, [
      h("label", {}, [h("span", { text: label("limit") + " " }), limit]),
      clear,
    ]),
    summary,
    error,
    empty,
    list,
    h("div", { class: "row" }, [previous, page, next]),
    h("p", { class: "muted", text: label("clearHint") }),
  );
  section.append(root);
  let alive = true;
  let timer;
  let busy = false;
  let pending = false;
  let changingLimit = false;
  const rows = new Map();
  panel.downloadsOffset ??= 0;
  panel.pageResources.push(() => {
    alive = false;
    clearTimeout(timer);
  });
  const fail = (cause) => {
    if (alive) {
      error.hidden = false;
      error.textContent = label("failed") + " " + cause.message;
    }
  };
  const mutate = async (operation, values, button) => {
    button.disabled = true;
    try {
      await panel.c.request(operation, values);
      if (alive) {
        error.hidden = true;
        await refresh();
      }
    } catch (cause) {
      fail(cause);
    } finally {
      if (alive) button.disabled = false;
    }
  };
  const refresh = async () => {
    if (!alive) return;
    if (busy) {
      pending = true;
      return;
    }
    busy = true;
    clearTimeout(timer);
    const offset = panel.downloadsOffset;
    try {
      const result = await panel.c.request("background-export-list", {
        offset,
      });
      if (!alive) return;
      if (offset !== panel.downloadsOffset) {
        pending = true;
        return;
      }
      if (offset && offset >= result.total) {
        panel.downloadsOffset = Math.max(
          0,
          Math.floor((result.total - 1) / 50) * 50,
        );
        pending = true;
        return;
      }
      if (!changingLimit) limit.value = String(result.maxConcurrent);
      summary.textContent = label("listSummary", result);
      empty.hidden = result.total !== 0;
      previous.disabled = offset === 0;
      next.disabled = offset + 50 >= result.total;
      page.textContent = result.total
        ? label("page", {
            start: offset + 1,
            end: Math.min(offset + 50, result.total),
            total: result.total,
          })
        : "";
      const keys = new Set(result.jobs.map((job) => job.jobId));
      for (const [key, row] of rows)
        if (!keys.has(key)) {
          row.element.remove();
          rows.delete(key);
        }
      for (const job of result.jobs) {
        let row = rows.get(job.jobId);
        if (!row) {
          const name = h("strong");
          const options = h("p", { class: "muted" });
          const status = h("p");
          const path = h("p", { class: "background-download-path" });
          const progress = h("progress", {
            max: "1",
            "aria-label": label("running"),
          });
          const cancel = h("button", { type: "button", text: label("cancel") });
          const retry = h("button", { type: "button", text: label("retry") });
          const element = h(
            "div",
            { class: "panel-card background-download-item" },
            [
              name,
              options,
              status,
              progress,
              path,
              h("div", { class: "row" }, [cancel, retry]),
            ],
          );
          cancel.addEventListener("click", () =>
            mutate(
              "background-export-queue-cancel",
              { jobId: job.jobId },
              cancel,
            ),
          );
          retry.addEventListener("click", () =>
            mutate("background-export-retry", { jobId: job.jobId }, retry),
          );
          row = {
            element,
            name,
            options,
            status,
            path,
            progress,
            cancel,
            retry,
          };
          rows.set(job.jobId, row);
          list.append(element);
        }
        row.name.textContent = job.name;
        row.options.textContent =
          job.format === "original"
            ? label("original")
            : [
                job.format.toUpperCase(),
                job.resolution === "original"
                  ? label("native")
                  : job.resolution === "custom"
                    ? `${job.width} × ${job.height}`
                    : job.resolution + "p",
                ["jpg", "mp4", "webm"].includes(job.format)
                  ? label(job.quality)
                  : "",
                job.timeSeconds > 0
                  ? label("time") + " " + job.timeSeconds
                  : "",
              ]
                .filter(Boolean)
                .join(" · ");
        row.status.textContent =
          (label(job.state) || job.state) + (job.error ? " " + job.error : "");
        row.path.textContent = job.path || job.destination;
        row.progress.hidden = !["queued", "running"].includes(job.state);
        if (typeof job.progress === "number") row.progress.value = job.progress;
        else row.progress.removeAttribute("value");
        row.cancel.hidden = !["queued", "running"].includes(job.state);
        row.retry.hidden = !["failed", "canceled"].includes(job.state);
      }
    } catch (cause) {
      fail(cause);
    } finally {
      busy = false;
      if (alive) {
        if (pending) {
          pending = false;
          refresh();
        } else timer = setTimeout(refresh, 1000);
      }
    }
  };
  clear.addEventListener("click", () =>
    mutate("background-export-clear", {}, clear),
  );
  previous.addEventListener("click", () => {
    panel.downloadsOffset = Math.max(0, panel.downloadsOffset - 50);
    refresh();
  });
  next.addEventListener("click", () => {
    panel.downloadsOffset += 50;
    refresh();
  });
  limit.addEventListener("change", async () => {
    changingLimit = true;
    await mutate(
      "background-export-limit",
      { limit: Number(limit.value) },
      limit,
    );
    changingLimit = false;
    refresh();
  });
  refresh();
}
