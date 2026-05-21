// Wait for CKEditor bundle to load
function ensureCKEditorLoaded() {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds max

        const checkCKEditor = setInterval(() => {
            attempts++;

            if (window.CKEDITOR && window.CKEDITOR.DecoupledEditor) {
                clearInterval(checkCKEditor);
                resolve();
            } else if (attempts >= maxAttempts) {
                clearInterval(checkCKEditor);
                reject(new Error('CKEditor bundle failed to load after 5 seconds'));
            }
        }, 100);
    });
}

async function editorInit() {
    try {
        // Wait for CKEditor to be available
        await ensureCKEditorLoaded();

        const editorElement = document.querySelector('#editor');
        if (!editorElement) {
            return Promise.reject(new Error('Editor element not found'));
        }

        const toolbarContainer = document.querySelector('#editor-toolbar');
        const wordCountContainer = document.querySelector('#editor-word-count');

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
        } = window.CKEDITOR;

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
            initialData: ``,
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

        return new Promise((resolve, reject) => {
            DecoupledEditor
                .create(editorElement, editorConfig)
                .then(editor => {
                    // Add toolbar
                    if (toolbarContainer) {
                        toolbarContainer.appendChild(editor.ui.view.toolbar.element);
                    }

                    // Add word count
                    const wordCount = editor.plugins.get('WordCount');
                    if (wordCountContainer) {
                        wordCountContainer.appendChild(wordCount.wordCountContainer);
                    }

                    console.log('✅ CKEditor 5 GPL loaded successfully (offline)');
                    window.editor = editor;
                    resolve(editor);
                })
                .catch(error => {
                    console.error('❌ Failed to create editor:', error);
                    reject(error);
                });
        });
    } catch (error) {
        console.error('❌ Editor initialization error:', error);
        return Promise.reject(error);
    }
}

// Utility functions for editors

function getEditorData() {
    if (window.editor && typeof window.editor.getData === 'function') {
        return window.editor.getData();
    }
    return '';
}

function setEditorData(data) {
    if (window.editor && typeof window.editor.setData === 'function') {
        window.editor.setData(data);
    }
}

function clearEditor() {
    if (window.editor && typeof window.editor.setData === 'function') {
        window.editor.setData('');
    }
}
