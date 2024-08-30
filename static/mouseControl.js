let modelScale = 1;
let modelX = 0;
let modelY = 0;
let isDragging = false;
let lastMouseX, lastMouseY;

function initializeMouseControl(app, model) {
    console.log("initializeMouseControl called");
    const canvas = app.view;
    canvas.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', endDrag);
    canvas.addEventListener('wheel', zoom);

    function resizeModel() {
        console.log("resizeModel called", { modelX, modelY, modelScale });
        const scale = Math.min(app.screen.width / model.width, app.screen.height / model.height) * 0.8 * modelScale;
        model.scale.set(scale);
        model.x = app.screen.width * 0.5 + modelX;
        model.y = app.screen.height * 0.5 + modelY;
        console.log("Model position updated", { x: model.x, y: model.y, scale: model.scale.x });
    }

    window.resizeModel = resizeModel;  // グローバルスコープに resizeModel を追加

    function startDrag(e) {
        console.log("startDrag called", { clientX: e.clientX, clientY: e.clientY });
        isDragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    }

    function drag(e) {
        if (isDragging) {
            console.log("drag called", { clientX: e.clientX, clientY: e.clientY });
            const deltaX = e.clientX - lastMouseX;
            const deltaY = e.clientY - lastMouseY;
            modelX += deltaX;
            modelY += deltaY;
            resizeModel();
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
        }
    }

    function endDrag() {
        isDragging = false;
    }

    function zoom(e) {
        e.preventDefault();
        const delta = e.deltaY * -0.001;
        modelScale = Math.min(Math.max(0.5, modelScale + delta), 2);
        resizeModel();
    }

    window.addEventListener('resize', resizeModel);

    // モデルの位置とサイズを更新する関数
    window.updateModelPosition = function(x, y, scale) {
        modelX = x;
        modelY = y;
        modelScale = scale;
        resizeModel();
    };

    window.getModelPosition = function() {
        return { x: modelX, y: modelY, scale: modelScale };
    };

    return resizeModel;
}

function setInitialPosition(x, y, scale) {
    modelX = x;
    modelY = y;
    modelScale = scale;
    if (typeof window.resizeModel === 'function') {
        window.resizeModel();
    } else {
        console.error('resizeModel関数が見つかりません。');
    }
}

window.setInitialPosition = setInitialPosition;  // グローバルスコープに setInitialPosition を追加