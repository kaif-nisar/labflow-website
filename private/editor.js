var CKEDITOR_BUNDLE_SRC = '/vendor/ckeditor5/browser/ckeditor5.umd.js';
var CKEDITOR_STYLESHEET_HREF = '/vendor/ckeditor5/ckeditor5.css';
var CKEDITOR_LOAD_TIMEOUT_MS = 10000;

if (typeof window !== 'undefined' && !Object.prototype.hasOwnProperty.call(window, 'editor')) {
    window.editor = null;
}

function getCKEditorNamespace() {
    if (window.CKEDITOR && window.CKEDITOR.DecoupledEditor) {
        return window.CKEDITOR;
    }

    return null;
}

function ensureCKEditorStylesLoaded() {
    const existingStylesheet = Array.from(
        document.querySelectorAll('link[rel="stylesheet"]')
    ).find((link) => {
        const href = link.getAttribute('href') || '';

        return (
            href.includes('/vendor/ckeditor5/ckeditor5.css') ||
            href.includes('/vendor/ckeditor5/browser/ckeditor5.css')
        );
    });

    if (existingStylesheet) {
        return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = CKEDITOR_STYLESHEET_HREF;
    link.setAttribute('data-ckeditor-styles', 'true');
    (document.head || document.documentElement).appendChild(link);
}

function waitForCKEditorNamespace(timeoutMs = CKEDITOR_LOAD_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        const startedAt = Date.now();

        const check = () => {
            const namespace = getCKEditorNamespace();
            if (namespace) {
                resolve(namespace);
                return;
            }

            if (globalThis.CKEDITOR_VERSION && !window.CKEDITOR) {
                reject(
                    new Error(
                        `CKEditor core was loaded without the UMD global. Expected ${CKEDITOR_BUNDLE_SRC}`
                    )
                );
                return;
            }

            if (Date.now() - startedAt >= timeoutMs) {
                reject(new Error('CKEditor bundle failed to load after 10 seconds'));
                return;
            }

            window.setTimeout(check, 50);
        };

        check();
    });
}

function loadCKEditorBundle() {
    const namespace = getCKEditorNamespace();
    if (namespace) {
        return Promise.resolve(namespace);
    }

    if (window.__ckEditorBundlePromise) {
        return window.__ckEditorBundlePromise;
    }

    ensureCKEditorStylesLoaded();

    const existingScript = Array.from(document.querySelectorAll('script[src]')).find((script) => {
        const src = script.getAttribute('src') || '';
        return src.includes('/vendor/ckeditor5/browser/ckeditor5.umd.js');
    });

    if (existingScript) {
        window.__ckEditorBundlePromise = waitForCKEditorNamespace();
        return window.__ckEditorBundlePromise;
    }

    if (globalThis.CKEDITOR_VERSION && !window.CKEDITOR) {
        return Promise.reject(
            new Error(
                `A non-UMD CKEditor bundle is already loaded. Replace it with ${CKEDITOR_BUNDLE_SRC}`
            )
        );
    }

    window.__ckEditorBundlePromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = CKEDITOR_BUNDLE_SRC;
        script.async = true;
        script.setAttribute('data-ckeditor-bundle', 'true');

        script.onload = () => {
            waitForCKEditorNamespace().then(resolve).catch(reject);
        };

        script.onerror = () => {
            reject(new Error(`Failed to load CKEditor bundle from ${CKEDITOR_BUNDLE_SRC}`));
        };

        (document.head || document.documentElement).appendChild(script);
    }).catch((error) => {
        window.__ckEditorBundlePromise = null;
        throw error;
    });

    return window.__ckEditorBundlePromise;
}

function ensureCKEditorLoaded() {
    return loadCKEditorBundle();
}

function getEditorInstance() {
    if (window.editor && typeof window.editor.getData === 'function') {
        return window.editor;
    }

    return null;
}

async function destroyEditor() {
    const activeEditor = getEditorInstance();
    if (!activeEditor || typeof activeEditor.destroy !== 'function') {
        window.editor = null;
        return;
    }

    try {
        await activeEditor.destroy();
    } catch (error) {
        console.warn('[CKEditor] Failed to destroy editor instance.', error);
    } finally {
        window.editor = null;
    }
}

function clearEditorContainers(toolbarContainer, wordCountContainer) {
    if (toolbarContainer) {
        toolbarContainer.innerHTML = '';
    }

    if (wordCountContainer) {
        wordCountContainer.innerHTML = '';
    }
}

async function editorInit() {
    try {
        const CKEDITOR = await ensureCKEditorLoaded();
        const editorElement = document.querySelector('#editor');

        if (!editorElement) {
            throw new Error('Editor element not found');
        }

        const toolbarContainer = document.querySelector('#editor-toolbar');
        const wordCountContainer = document.querySelector('#editor-word-count');

        const existingEditor = getEditorInstance();
        if (existingEditor) {
            if (existingEditor.sourceElement === editorElement) {
                return existingEditor;
            }

            await destroyEditor();
        }

        clearEditorContainers(toolbarContainer, wordCountContainer);

        const {
            DecoupledEditor,
            Alignment,
            Autoformat,
            AutoImage,
            AutoLink,
            Autosave,
            BlockQuote,
            Bold,
            Code,
            CodeBlock,
            Essentials,
            FindAndReplace,
            FontBackgroundColor,
            FontColor,
            FontFamily,
            FontSize,
            GeneralHtmlSupport,
            Heading,
            Highlight,
            HorizontalLine,
            ImageBlock,
            ImageCaption,
            ImageInline,
            ImageInsert,
            ImageResize,
            ImageStyle,
            ImageTextAlternative,
            ImageToolbar,
            Indent,
            IndentBlock,
            Italic,
            Link,
            LinkImage,
            List,
            ListProperties,
            MediaEmbed,
            PageBreak,
            Paragraph,
            PasteFromOffice,
            RemoveFormat,
            SpecialCharacters,
            SpecialCharactersArrows,
            SpecialCharactersCurrency,
            SpecialCharactersEssentials,
            SpecialCharactersLatin,
            SpecialCharactersMathematical,
            SpecialCharactersText,
            Strikethrough,
            Subscript,
            Superscript,
            Table,
            TableCaption,
            TableCellProperties,
            TableColumnResize,
            TableProperties,
            TableToolbar,
            TextTransformation,
            TodoList,
            Underline,
            WordCount
        } = CKEDITOR;

        const editorConfig = {
            toolbar: {
                items: [
                    'undo', 'redo',
                    '|',
                    'heading',
                    '|',
                    'fontSize', 'fontFamily', 'fontColor', 'fontBackgroundColor',
                    '|',
                    'bold', 'italic', 'underline', 'strikethrough',
                    'subscript', 'superscript', 'code',
                    '|',
                    'link', 'insertImage', 'insertTable', 'mediaEmbed',
                    'blockQuote', 'codeBlock',
                    '|',
                    'alignment',
                    '|',
                    'bulletedList', 'numberedList', 'todoList',
                    'outdent', 'indent',
                    '|',
                    'specialCharacters', 'horizontalLine', 'pageBreak',
                    '|',
                    'highlight', 'removeFormat',
                    '|',
                    'findAndReplace'
                ],
                shouldNotGroupWhenFull: true
            },
            plugins: [
                Alignment,
                Autoformat,
                AutoImage,
                AutoLink,
                Autosave,
                BlockQuote,
                Bold,
                Code,
                CodeBlock,
                Essentials,
                FindAndReplace,
                FontBackgroundColor,
                FontColor,
                FontFamily,
                FontSize,
                GeneralHtmlSupport,
                Heading,
                Highlight,
                HorizontalLine,
                ImageBlock,
                ImageCaption,
                ImageInline,
                ImageInsert,
                ImageResize,
                ImageStyle,
                ImageTextAlternative,
                ImageToolbar,
                Indent,
                IndentBlock,
                Italic,
                Link,
                LinkImage,
                List,
                ListProperties,
                MediaEmbed,
                PageBreak,
                Paragraph,
                PasteFromOffice,
                RemoveFormat,
                SpecialCharacters,
                SpecialCharactersArrows,
                SpecialCharactersCurrency,
                SpecialCharactersEssentials,
                SpecialCharactersLatin,
                SpecialCharactersMathematical,
                SpecialCharactersText,
                Strikethrough,
                Subscript,
                Superscript,
                Table,
                TableCaption,
                TableCellProperties,
                TableColumnResize,
                TableProperties,
                TableToolbar,
                TextTransformation,
                TodoList,
                Underline,
                WordCount
            ],
            fontFamily: {
                options: [
                    'default',
                    'Arial, sans-serif',
                    'Georgia, serif',
                    'Times New Roman, serif',
                    'Courier New, monospace',
                    'Verdana, sans-serif',
                    'Comic Sans MS, cursive'
                ],
                supportAllValues: true
            },
            fontSize: {
                options: [10, 12, 14, 'default', 18, 20, 22, 24, 26, 28, 30],
                supportAllValues: true
            },
            heading: {
                options: [
                    { model: 'paragraph', title: 'Paragraph', class: 'ck-heading_paragraph' },
                    { model: 'heading1', view: 'h1', title: 'Heading 1', class: 'ck-heading_heading1' },
                    { model: 'heading2', view: 'h2', title: 'Heading 2', class: 'ck-heading_heading2' },
                    { model: 'heading3', view: 'h3', title: 'Heading 3', class: 'ck-heading_heading3' },
                    { model: 'heading4', view: 'h4', title: 'Heading 4', class: 'ck-heading_heading4' },
                    { model: 'heading5', view: 'h5', title: 'Heading 5', class: 'ck-heading_heading5' },
                    { model: 'heading6', view: 'h6', title: 'Heading 6', class: 'ck-heading_heading6' }
                ]
            },
            htmlSupport: {
                allow: [
                    {
                        name: /.*/,
                        attributes: true,
                        classes: true,
                        styles: true
                    }
                ]
            },
            image: {
                toolbar: [
                    'imageTextAlternative', 'toggleImageCaption',
                    '|',
                    'imageStyle:inline', 'imageStyle:block', 'imageStyle:side',
                    '|',
                    'resizeImage'
                ]
            },
            initialData: '',
            licenseKey: 'GPL',
            link: {
                addTargetToExternalLinks: true,
                defaultProtocol: 'https://'
            },
            list: {
                properties: {
                    styles: true,
                    startIndex: true,
                    reversed: true
                }
            },
            placeholder: 'Type or paste your content here!',
            table: {
                contentToolbar: [
                    'tableColumn', 'tableRow', 'mergeTableCells',
                    'tableProperties', 'tableCellProperties'
                ]
            }
        };

        const editor = await DecoupledEditor.create(editorElement, editorConfig);

        if (toolbarContainer) {
            toolbarContainer.appendChild(editor.ui.view.toolbar.element);
        }

        const wordCount = editor.plugins.get('WordCount');
        if (wordCountContainer) {
            wordCountContainer.appendChild(wordCount.wordCountContainer);
        }

        window.editor = editor;
        console.log('[CKEditor] Editor initialized successfully.');
        return editor;
    } catch (error) {
        console.error('[CKEditor] Editor initialization error:', error);
        throw error;
    }
}

function getEditorData() {
    const editor = getEditorInstance();
    if (editor) {
        return editor.getData();
    }

    return '';
}

function setEditorData(data) {
    const editor = getEditorInstance();
    if (!editor || typeof editor.setData !== 'function') {
        return false;
    }

    editor.setData(data || '');
    return true;
}

function clearEditor() {
    return setEditorData('');
}
