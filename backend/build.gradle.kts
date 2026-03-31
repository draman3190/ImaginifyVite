plugins {
    java
    id("org.springframework.boot") version "3.5.5"
    id("io.spring.dependency-management") version "1.1.7"
}

group = "com.imaginify"
version = "0.0.1-SNAPSHOT"

java {
    sourceCompatibility = JavaVersion.VERSION_21
    targetCompatibility = JavaVersion.VERSION_21
}

repositories {
    mavenCentral()
}

dependencyManagement {
    imports {
        mavenBom("software.amazon.awssdk:bom:2.29.45")
    }
}

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.springframework.boot:spring-boot-starter-actuator")

    implementation("software.amazon.awssdk:dynamodb-enhanced")
    implementation("software.amazon.awssdk:s3")
    implementation("software.amazon.awssdk:secretsmanager")
    implementation("software.amazon.awssdk:lambda")
    implementation("software.amazon.awssdk:url-connection-client")

    implementation("com.fasterxml.jackson.datatype:jackson-datatype-jsr310")

    implementation("com.amazonaws:aws-lambda-java-core:1.2.3")
    implementation("com.amazonaws:aws-lambda-java-events:3.14.0")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

// Lean dependency set for event handler ZIP (no Spring, no Secrets Manager)
val eventHandlerDeps by configurations.creating {
    isCanBeResolved = true
    isCanBeConsumed = false
}

dependencies {
    eventHandlerDeps("com.amazonaws:aws-lambda-java-core:1.2.3")
    eventHandlerDeps("com.amazonaws:aws-lambda-java-events:3.14.0")
    eventHandlerDeps(platform("software.amazon.awssdk:bom:2.29.45"))
    eventHandlerDeps("software.amazon.awssdk:dynamodb-enhanced")
    eventHandlerDeps("software.amazon.awssdk:s3")
    eventHandlerDeps("software.amazon.awssdk:secretsmanager")
    eventHandlerDeps("software.amazon.awssdk:lambda")
    eventHandlerDeps("software.amazon.awssdk:url-connection-client")
    eventHandlerDeps("com.fasterxml.jackson.core:jackson-databind:2.18.2")
    eventHandlerDeps("org.slf4j:slf4j-simple:2.0.16")
}

tasks.withType<Test> {
    useJUnitPlatform()
}

tasks.named<org.springframework.boot.gradle.tasks.bundling.BootJar>("bootJar") {
    archiveFileName.set("imaginify-backend.jar")
}

tasks.named<Jar>("jar") {
    enabled = false
}

tasks.register<Copy>("packageLambda") {
    dependsOn("bootJar")
    from(tasks.named("bootJar"))
    from("src/main/lambda")
    into(layout.buildDirectory.dir("lambda"))
}

tasks.register<Zip>("packageEventHandler") {
    dependsOn("classes")
    archiveFileName.set("event-handler.zip")
    destinationDirectory.set(layout.buildDirectory.dir("event-handler"))
    from(sourceSets.main.get().output.classesDirs)
    into("lib") { from(eventHandlerDeps) }
}

tasks.register<Zip>("packageImageGenerationHandler") {
    dependsOn("classes")
    archiveFileName.set("image-generation-handler.zip")
    destinationDirectory.set(layout.buildDirectory.dir("image-generation-handler"))
    from(sourceSets.main.get().output.classesDirs)
    into("lib") { from(eventHandlerDeps) }
}