package com.dalilacom.app.ui.common

import com.dalilacom.app.data.network.CategoryDto

/** id -> category for the whole section > profession > specialty tree. */
fun indexCategories(tree: List<CategoryDto>): Map<String, CategoryDto> {
    val out = LinkedHashMap<String, CategoryDto>()
    fun walk(nodes: List<CategoryDto>) {
        nodes.forEach { out[it.id] = it; walk(it.children) }
    }
    walk(tree)
    return out
}

/** The path from a top-level section down to [id] (empty when unknown). */
fun categoryChain(tree: List<CategoryDto>, id: String?): List<CategoryDto> {
    if (id == null) return emptyList()
    fun find(nodes: List<CategoryDto>, trail: List<CategoryDto>): List<CategoryDto>? {
        for (node in nodes) {
            val next = trail + node
            if (node.id == id) return next
            find(node.children, next)?.let { return it }
        }
        return null
    }
    return find(tree, emptyList()).orEmpty()
}
