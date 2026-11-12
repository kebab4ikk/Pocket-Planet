import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "app.pocketplanet"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.pocketplanet"
        minSdk = 26
        targetSdk = 35
        // Each CI build gets a higher number so a new APK installs over the old one.
        versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
        versionName = "1.0." + (System.getenv("GITHUB_RUN_NUMBER") ?: "0")
    }

    signingConfigs {
        // A fixed key so every build can update the previous one. It only proves
        // "same app as before" for sideloading; it is not a secret.
        create("shared") {
            storeFile = file("pocket-planet.keystore")
            storePassword = "pocketplanet"
            keyAlias = "pocketplanet"
            keyPassword = "pocketplanet"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("shared")
        }
        debug { signingConfig = signingConfigs.getByName("shared") }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin { compilerOptions { jvmTarget.set(JvmTarget.JVM_17) } }

dependencies {
    implementation(project(":core"))
}
