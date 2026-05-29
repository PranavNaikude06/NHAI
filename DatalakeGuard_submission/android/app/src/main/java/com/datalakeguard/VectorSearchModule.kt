package com.datalakeguard

import com.facebook.react.bridge.*

class VectorSearchModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "VectorSearch"
    }

    @ReactMethod
    fun loadEmbeddings(embeddings: ReadableArray, userIds: ReadableArray, promise: Promise) {
        try {
            val count = embeddings.size()
            val idCount = userIds.size()
            val limit = Math.min(count, idCount)

            val embList = mutableListOf<FloatArray>()
            val idList = mutableListOf<String>()

            for (i in 0 until limit) {
                val embArray = embeddings.getArray(i) ?: continue
                val userId = userIds.getString(i) ?: continue
                
                val size = embArray.size()
                val vector = FloatArray(size)
                for (j in 0 until size) {
                    vector[j] = embArray.getDouble(j).toFloat()
                }
                embList.add(vector)
                idList.add(userId)
            }

            VectorSearchEngine.loadEmbeddings(embList, idList)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("LOAD_ERROR", "Failed to load embeddings into native memory cache: ${e.message}", e)
        }
    }

    @ReactMethod
    fun findBestMatch(queryEmbedding: ReadableArray, promise: Promise) {
        try {
            val size = queryEmbedding.size()
            val query = FloatArray(size)
            for (i in 0 until size) {
                query[i] = queryEmbedding.getDouble(i).toFloat()
            }

            val matchResult = VectorSearchEngine.findBestMatch(query)

            val result = Arguments.createMap().apply {
                putString("userId", matchResult.userId)
                putDouble("similarity", matchResult.similarity.toDouble())
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("SEARCH_ERROR", "Failed to run native vector search match: ${e.message}", e)
        }
    }

    @ReactMethod
    fun addEmbedding(userId: String, embedding: ReadableArray, promise: Promise) {
        try {
            val size = embedding.size()
            val vector = FloatArray(size)
            for (j in 0 until size) {
                vector[j] = embedding.getDouble(j).toFloat()
            }

            VectorSearchEngine.addEmbedding(userId, vector)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("ADD_ERROR", "Failed to append embedding to native memory cache: ${e.message}", e)
        }
    }
}
