import { exec } from "child_process";
import fs from "fs";
import { promisify } from "util";
import { connectJetStream, publishSubmissionEvent } from "../shared/jetStream.js";
import { connectRabbitMQ } from "../shared/rabbitMQ.js";
import { getSubmissionCollection } from "../shared/mongoDB.js";

const execPromise = promisify(exec);

(async () => {
    const channel = await connectRabbitMQ("java-code-queue");
    const { js, sc } = await connectJetStream();
    const collection = await getSubmissionCollection();

    console.log(`[*] Waiting for messages in java-code-queue`);

    channel.consume("java-code-queue", async (msg) => {
        if (msg !== null) {
            const { sourceCode, id, qid, jobId, testcases, submissionId, questionTitle, problemSetterName } = JSON.parse(msg.content.toString());
            console.log(`jobid : ${jobId}`);
            console.log(`Received Java Code:\n${sourceCode}`);

            try {
                const results = await executeCode(sourceCode, testcases);
                console.log(`Execution Result:`, results);

                const updateResult = await collection.updateOne({ jobId }, {
                    $set: {
                        executionStatus: "executed",
                        results
                    }
                });

                if (updateResult.modifiedCount === 1) {
                    console.log("✅ Document updated successfully");
                    await publishSubmissionEvent(js, sc, { id, submissionId, qid, questionTitle, problemSetterName, results });
                } else {
                    console.log("Something went wrong while updating document");
                }
            } catch (error) {
                console.error(`Error executing Java code: ${error.message}`);
            }

            channel.ack(msg);
        }
    });
})();

async function executeCode(sourceCode, testCases) {
    const filename = "Solution.java";
    const className = "Solution";

    fs.writeFileSync(filename, sourceCode);

    const compileCommand = `javac ${filename}`;
    await execPromise(compileCommand);

    let testResults = [];

    for (const testCase of testCases) {
        const { input, expectedOutput } = testCase;

        try {
            const { stdout } = await execPromise(`echo "${input}" | java ${className}`);
            const actualOutput = stdout.trim();
            const isCorrect = actualOutput === expectedOutput;

            testResults.push({ input, expectedOutput, actualOutput, isCorrect });
        } catch (error) {
            testResults.push({ input, expectedOutput, actualOutput: "Error", status: "failed" });
        }
    }

    return testResults;
}
