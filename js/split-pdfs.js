document.addEventListener("DOMContentLoaded", () => {
  const pdfContainer = document.getElementById("pdf-container");
  const fileInput = document.getElementById("file-input");
  const uploadBtn = document.querySelector(".upload-btn");
  const downloadBtn = document.querySelector(".download-btn");
  const undoBtn = document.querySelector(".undo-btn");
  const notification = document.createElement("div"); // Notification element

  if (!pdfContainer || !fileInput || !uploadBtn || !downloadBtn || !undoBtn) {
    console.error("Required elements are missing in the DOM.");
    return;
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc = "../js/pdf.worker.min.js";

  let pdfDoc = null;
  let originalPdfBytes = null;
  let draggedElement = null;
  let draggedOverElement = null;
  let deletedPages = [];

  // Create and style the notification element
  notification.className = "notification";
  document.body.appendChild(notification);

  // Create and style the zoom overlay
  const zoomOverlay = document.createElement("div");
  zoomOverlay.className = "zoom-overlay";
  document.body.appendChild(zoomOverlay);

  const zoomContainer = document.createElement("div");
  zoomContainer.className = "zoom-container";
  zoomOverlay.appendChild(zoomContainer);

  fileInput.addEventListener("change", loadPdf);
  undoBtn.addEventListener("click", undoDelete);
  downloadBtn.addEventListener("click", downloadPDF);

  zoomOverlay.addEventListener("click", hideZoom);

  async function loadPdf(event) {
    const file = event.target.files[0];
    if (!file) return;

    const fileReader = new FileReader();

    fileReader.onload = async function () {
      try {
        originalPdfBytes = new Uint8Array(this.result);
        pdfDoc = await pdfjsLib.getDocument({ data: originalPdfBytes }).promise;
        await renderPages();
        showButtons();
      } catch (error) {
        console.error("Error loading PDF:", error);
        alert("Error loading PDF. Please try another file.");
      }
    };

    fileReader.readAsArrayBuffer(file);
  }

  function showButtons() {
    uploadBtn.classList.add("hidden");
    downloadBtn.classList.remove("hidden");
    undoBtn.classList.remove("hidden");
  }

  async function renderPages() {
    pdfContainer.innerHTML = "";
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      await renderPage(i, 1.0); // Render previews at 100% scale
    }
    setupDragAndDrop();
    setupPageActions();
  }

  async function renderPage(pageNum, scale) {
    try {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: scale });

      const pageContainer = document.createElement("div");
      pageContainer.className = "page-container";
      pageContainer.draggable = true;
      pageContainer.id = `page-${pageNum}`;

      const canvas = document.createElement("canvas");
      canvas.className = "pdf-canvas";
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.setAttribute("data-page-number", pageNum);
      canvas.setAttribute("data-rotation", 0);

      const context = canvas.getContext("2d");
      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      await page.render(renderContext).promise;

      const pageNumber = document.createElement("div");
      pageNumber.className = "page-number";
      pageNumber.textContent = pageNum;

      const actionsDiv = document.createElement("div");
      actionsDiv.className = "page-actions";
      actionsDiv.innerHTML = `
        <button class="action-btn" data-action="duplicate">📋</button>
        <button class="action-btn" data-action="rotate">🔄</button>
        <button class="action-btn" data-action="delete">🗑️</button>
        <button class="action-btn" data-action="zoom">🔍</button> <!-- Zoom button -->
      `;

      pageContainer.appendChild(canvas);
      pageContainer.appendChild(pageNumber);
      pageContainer.appendChild(actionsDiv);
      pdfContainer.appendChild(pageContainer);
    } catch (error) {
      console.error("Error rendering page:", error);
    }
  }

  function setupDragAndDrop() {
    const pages = document.querySelectorAll(".page-container");

    pages.forEach((page) => {
      page.addEventListener("dragstart", function () {
        draggedElement = this;
        this.classList.add("selected");
      });

      page.addEventListener("dragover", function (e) {
        e.preventDefault();
        draggedOverElement = this;
        this.classList.add("drag-over");
      });

      page.addEventListener("dragleave", function () {
        this.classList.remove("drag-over");
      });

      page.addEventListener("drop", function (e) {
        e.preventDefault();
        this.classList.remove("drag-over");

        if (draggedElement && draggedElement !== this) {
          const pages = document.querySelectorAll(".page-container");

          if (this === pages[0]) {
            pdfContainer.insertBefore(draggedElement, pages[0]);
          } else {
            if (this.nextSibling) {
              pdfContainer.insertBefore(draggedElement, this.nextSibling);
            } else {
              pdfContainer.appendChild(draggedElement);
            }
          }

          draggedElement.classList.remove("selected");
          draggedElement = null;
          renumberPages();
        }
      });

      page.addEventListener("dragend", function () {
        if (draggedElement) {
          draggedElement.classList.remove("selected");
          draggedElement = null;
        }
      });
    });
  }

  function renumberPages() {
    const pages = document.querySelectorAll(".page-container");
    pages.forEach((page, index) => {
      const pageNumber = page.querySelector(".page-number");
      pageNumber.textContent = index + 1;
    });
  }

  function setupPageActions() {
    document.body.addEventListener("click", (event) => {
      if (event.target.classList.contains("action-btn")) {
        const action = event.target.dataset.action;
        const pageContainer = event.target.closest(".page-container");

        switch (action) {
          case "duplicate":
            duplicatePage(pageContainer);
            break;
          case "rotate":
            rotatePage(pageContainer);
            break;
          case "delete":
            deletePage(pageContainer);
            break;
          case "zoom":
            const canvas = pageContainer.querySelector("canvas");
            showZoom(canvas);
            break;
        }
      }
    });
  }

  async function showZoom(pageCanvas) {
    zoomContainer.innerHTML = ""; // Clear previous content

    const pageNum = parseInt(pageCanvas.getAttribute("data-page-number"));
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 }); // Double scale for zoom

    // Create a new canvas for the zoom view
    const zoomCanvas = document.createElement("canvas");
    zoomCanvas.className = "zoom-canvas";
    zoomContainer.appendChild(zoomCanvas);

    zoomCanvas.width = viewport.width;
    zoomCanvas.height = viewport.height;

    const context = zoomCanvas.getContext("2d");
    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    };

    await page.render(renderContext).promise;

    // Fit the zoomed canvas to the viewport
    fitZoomCanvasToViewport(zoomCanvas);

    zoomOverlay.style.display = "flex"; // Show overlay
  }

  function fitZoomCanvasToViewport(canvas) {
    const zoomContainerRect = zoomContainer.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();

    const scaleX = zoomContainerRect.width / canvasRect.width;
    const scaleY = zoomContainerRect.height / canvasRect.height;
    const scale = Math.min(scaleX, scaleY);

    canvas.style.transform = `scale(${scale})`;
    canvas.style.transformOrigin = "0 0";
  }

  function hideZoom() {
    zoomOverlay.style.display = "none"; // Hide overlay
  }

  async function duplicatePage(pageContainer) {
    const pageNum = parseInt(
      pageContainer
        .querySelector(".pdf-canvas")
        .getAttribute("data-page-number")
    );

    try {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.0 });

      const clonedPageContainer = pageContainer.cloneNode(true);
      const canvas = clonedPageContainer.querySelector("canvas");
      const context = canvas.getContext("2d");

      clonedPageContainer.id = `page-${Date.now()}`;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({
        canvasContext: context,
        viewport: viewport,
      }).promise;

      pdfContainer.insertBefore(clonedPageContainer, pageContainer.nextSibling);
      renumberPages();
      setupDragAndDrop();
    } catch (error) {
      console.error("Error duplicating page:", error);
    }
  }

  function rotatePage(pageContainer) {
    const canvas = pageContainer.querySelector("canvas");
    const currentRotation = parseInt(canvas.getAttribute("data-rotation")) || 0;
    const newRotation = (currentRotation + 90) % 360;

    canvas.setAttribute("data-rotation", newRotation);

    const rotationDegrees = newRotation;
    canvas.style.transform = `rotate(${rotationDegrees}deg)`;
    canvas.style.transformOrigin = "center center";
  }

  function deletePage(pageContainer) {
    const pages = Array.from(document.querySelectorAll(".page-container"));
    const index = pages.indexOf(pageContainer);

    const isAlreadyDeleted = deletedPages.some(
      (deletedPage) => deletedPage.pageContainer === pageContainer
    );

    if (!isAlreadyDeleted) {
      deletedPages.push({ pageContainer, index });
    }

    pageContainer.remove();
    renumberPages();
  }

  function undoDelete() {
    if (deletedPages.length > 0) {
      const { pageContainer, index } = deletedPages.pop();

      const pages = document.querySelectorAll(".page-container");
      if (index >= pages.length) {
        pdfContainer.appendChild(pageContainer);
      } else {
        pdfContainer.insertBefore(pageContainer, pages[index] || null);
      }

      renumberPages();
      setupDragAndDrop();
      setupPageActions();
      showNotification("Page restored successfully!");
    }
  }

  async function downloadPDF() {
    try {
      const pdfData = await pdfDoc.save();
      const blob = new Blob([pdfData], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "edited.pdf";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error downloading PDF:", error);
      alert("Error downloading PDF.");
    }
  }

  function showNotification(message) {
    notification.textContent = message;
    notification.classList.add("show");

    setTimeout(() => {
      notification.classList.remove("show");
    }, 3000);
  }
});
