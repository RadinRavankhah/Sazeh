"""Unit tests for the atomic tree-patch engine (apps/sites/tree.py)."""
import uuid

import pytest

from apps.sites.tree import TreePatchService


def make_tree():
    return {
        "id": "root",
        "component": "Section",
        "props": {"padding": "md"},
        "children": [
            {
                "id": "a",
                "component": "Section",
                "props": {},
                "children": [
                    {"id": "a1", "component": "Button",
                     "props": {"label": "Hi"}, "children": []},
                ],
            },
            {"id": "b", "component": "HeroSection",
             "props": {"headline": "H"}, "children": []},
        ],
    }


def test_update_props_merges():
    tree = TreePatchService.apply_patch(make_tree(), [
        {"op": "update_props", "node_id": "a", "props": {"padding": "lg"}},
    ])
    node = next(c for c in tree["children"] if c["id"] == "a")
    assert node["props"] == {"padding": "lg"}


def test_insert_respects_index():
    tree = TreePatchService.apply_patch(make_tree(), [
        {"op": "insert", "parent_id": "root", "index": 0,
         "component": "Button", "props": {"label": "New"}},
    ])
    assert tree["children"][0]["props"]["label"] == "New"
    assert len(tree["children"]) == 3


def test_insert_without_index_appends_and_generates_id():
    tree = TreePatchService.apply_patch(make_tree(), [
        {"op": "insert", "parent_id": "root", "index": None,
         "component": "Button", "props": {}},
    ])
    inserted = tree["children"][-1]
    assert inserted["id"]
    uuid.UUID(inserted["id"])  # must be a valid uuid string


def test_insert_with_subtree_reassigns_ids_recursively():
    """Duplicate/paste: client ids are ignored; the server issues fresh ones
    at every level so a duplicated branch can never collide with the original."""
    tree = TreePatchService.apply_patch(make_tree(), [
        {"op": "insert", "parent_id": "root", "index": 0,
         "component": "Section", "props": {"padding": "lg"},
         "children": [
             {"id": "root", "component": "Heading",
              "props": {"text": "Dup"}, "children": []},
         ]},
    ])
    inserted = tree["children"][0]
    assert inserted["id"] != "root"
    uuid.UUID(inserted["id"])
    child = inserted["children"][0]
    assert child["id"] != "root"  # the client-supplied "root" id was dropped
    uuid.UUID(child["id"])
    assert child["props"] == {"text": "Dup"}


def test_insert_subtree_deep_nesting_is_preserved():
    tree = TreePatchService.apply_patch(make_tree(), [
        {"op": "insert", "parent_id": "root", "component": "Section",
         "children": [
             {"component": "Section", "children": [
                 {"component": "Button", "props": {"label": "Deep"}},
             ]},
         ]},
    ])
    inserted = tree["children"][-1]
    deep = inserted["children"][0]["children"][0]
    assert deep["props"] == {"label": "Deep"}
    uuid.UUID(deep["id"])


def test_insert_subtree_bad_shape_raises():
    with pytest.raises(ValueError, match="children"):
        TreePatchService.apply_patch(make_tree(), [
            {"op": "insert", "parent_id": "root", "component": "Section",
             "children": "nope"},
        ])


def test_delete_removes_node():
    tree = TreePatchService.apply_patch(make_tree(), [
        {"op": "delete", "node_id": "a1"},
    ])
    section_a = next(c for c in tree["children"] if c["id"] == "a")
    assert section_a["children"] == []


def test_delete_root_is_rejected():
    with pytest.raises(ValueError, match="root"):
        TreePatchService.apply_patch(make_tree(), [{"op": "delete", "node_id": "root"}])


def test_move_between_parents():
    tree = TreePatchService.apply_patch(make_tree(), [
        {"op": "move", "node_id": "a1", "new_parent_id": "root", "index": 0},
    ])
    assert tree["children"][0]["id"] == "a1"
    section_a = next(c for c in tree["children"] if c["id"] == "a")
    assert section_a["children"] == []


def test_input_tree_is_not_mutated():
    original = make_tree()
    TreePatchService.apply_patch(original, [{"op": "delete", "node_id": "a1"}])
    section_a = next(c for c in original["children"] if c["id"] == "a")
    assert [c["id"] for c in section_a["children"]] == ["a1"]


def test_unknown_op_raises():
    with pytest.raises(ValueError, match="Unknown operation"):
        TreePatchService.apply_patch(make_tree(), [{"op": "teleport", "node_id": "a"}])


def test_missing_node_raises():
    with pytest.raises(ValueError, match="not found"):
        TreePatchService.apply_patch(
            make_tree(), [{"op": "update_props", "node_id": "nope", "props": {}}]
        )


def test_failed_batch_leaves_no_partial_state():
    original = make_tree()
    with pytest.raises(ValueError):
        TreePatchService.apply_patch(original, [
            {"op": "update_props", "node_id": "a", "props": {"padding": "lg"}},
            {"op": "update_props", "node_id": "does-not-exist", "props": {}},
        ])
    section_a = next(c for c in original["children"] if c["id"] == "a")
    assert section_a["props"] == {}  # first op rolled back with the batch
