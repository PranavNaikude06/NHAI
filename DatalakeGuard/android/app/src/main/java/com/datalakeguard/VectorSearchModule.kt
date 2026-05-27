package com.datalakeguard

import com.facebook.react.bridge.*
import kotlin.math.sqrt

class VectorSearchModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "VectorSearch"
    }

    // In-memory cache of enrolled embeddings, pre-computed L2 norms, and matching user IDs
    private val enrolledEmbeddings = mutableListOf<FloatArray>()
    private val enrolledNorms = mutableListOf<Float>()
    private val enrolledUserIds = mutableListOf<String>()

    @ReactMethod
    fun loadEmbeddings(embeddings: ReadableArray, userIds: ReadableArray, promise: Promise) {
        try {
            synchronized(this) {
                enrolledEmbeddings.clear()
                enrolledNorms.clear()
                enrolledUserIds.clear()

                val count = embeddings.size()
                val idCount = userIds.size()
                val limit = Math.min(count, idCount)

                for (i in 0 until limit) {
                    val embArray = embeddings.getArray(i) ?: continue
                    val userId = userIds.getString(i) ?: continue
                    
                    val size = embArray.size()
                    val vector = FloatArray(size)
                    var normSum = 0.0f

                    for (j in 0 until size) {
                        val v = embArray.getDouble(j).toFloat()
                        vector[j] = v
                        normSum += v * v
                    }

                    val norm = if (normSum > 0.0f) sqrt(normSum) else 1.0f

                    enrolledEmbeddings.add(vector)
                    enrolledNorms.add(norm)
                    enrolledUserIds.add(userId)
                }
            }
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
            var queryNormSum = 0.0f

            for (i in 0 until size) {
                val v = queryEmbedding.getDouble(i).toFloat()
                query[i] = v
                queryNormSum += v * v
            }

            val queryNorm = if (queryNormSum > 0.0f) sqrt(queryNormSum) else 1.0f

            var bestUserId: String? = null
            var maxSimilarity = -1.0f

            synchronized(this) {
                val count = enrolledEmbeddings.size
                for (i in 0 until count) {
                    val cachedVector = enrolledEmbeddings[i]
                    val cachedNorm = enrolledNorms[i]

                    // If length matches, calculate dot product
                    if (cachedVector.size == size) {
                        var dotProduct = 0.0f
                        // JVM auto-vectorizes this loop (using ARM NEON / SIMD instructions)
                        for (j in 0 until size) {
                            dotProduct += query[j] * cachedVector[j]
                        }

                        val similarity = dotProduct / (queryNorm * cachedNorm)
                        if (similarity > maxSimilarity) {
                            maxSimilarity = similarity
                            bestUserId = enrolledUserIds[i]
                        }
                    }
                }
            }

            val result = Arguments.createMap().apply {
                putString("userId", bestUserId)
                putDouble("similarity", maxSimilarity.toDouble())
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
            var normSum = 0.0f

            for (j in 0 until size) {
                val v = embedding.getDouble(j).toFloat()
                vector[j] = v
                normSum += v * v
            }

            val norm = if (normSum > 0.0f) sqrt(normSum) else 1.0f

            synchronized(this) {
                // Check if user already exists and update, or append new
                val idx = enrolledUserIds.indexOf(userId)
                if (idx != -1) {
                    enrolledEmbeddings[idx] = vector
                    enrolledNorms[idx] = norm
                } else {
                    enrolledEmbeddings.add(vector)
                    enrolledNorms.add(norm)
                    enrolledUserIds.add(userId)
                }
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("ADD_ERROR", "Failed to append embedding to native memory cache: ${e.message}", e)
        }
    }
}
