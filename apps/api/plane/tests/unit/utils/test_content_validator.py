import pytest

from plane.utils.content_validator import validate_html_content


@pytest.mark.unit
class TestEditorNodeSanitization:
    """Editör node'ları (gerçek Plane ile aynı HTML) sanitizer'dan geçmeli."""

    @pytest.mark.parametrize(
        "html",
        [
            '<inline-date-component data-id="a" date="2026-09-13"></inline-date-component>',
            '<inline-status-component data-id="a" text="Done" color="green"></inline-status-component>',
            '<details class="editor-details-block" data-id="a"><summary class="editor-details-summary">t</summary>'
            '<div class="editor-details-content" data-type="detailsContent"><p>x</p></div></details>',
            '<div data-id="a" data-orientation="vertical" data-node-type="tabs" class="editor-tabs" data-spacing-group="container">'
            '<div data-id="b" data-title="Tab 1" data-node-type="tab" class="editor-tab"><p>a</p></div></div>',
            '<div data-node-type="column-list" class="editor-column-list"><div data-width="2" data-node-type="column" class="editor-column"><p>c</p></div></div>',
            '<attachment-component id="a" data-preview="" data-accepted-file-type="video" status="pending" data-spacing-group="container"></attachment-component>',
            '<page-embed-component id="a" entity_identifier="b"></page-embed-component>',
            '<external-embed-component id="a" src="https://example.com" display="embed" title="t"></external-embed-component>',
            '<pre data-id="a"><code class="language-mermaid">graph TD; A--&gt;B</code></pre>',
        ],
    )
    def test_editor_nodes_survive(self, html):
        is_valid, error, clean = validate_html_content(html)
        assert is_valid and error is None
        assert clean == html

    def test_scripts_still_stripped(self):
        _, _, clean = validate_html_content('<p>a</p><script>alert(1)</script>')
        assert "<script" not in clean
