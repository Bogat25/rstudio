#include "ChatLocal.hpp"

#include <gtest/gtest.h>

using namespace rstudio::session::modules::chat;

TEST(LocalChat, RefusesExecutionAndFileMutation)
{
   for (const char* method : {"runtime/executeCode", "workspace/writeFileContent",
                            "workspace/editFileContent", "runtime/cancelExecution",
                            "ui/checkForUpdates", "unknown/method"})
      EXPECT_FALSE(local::permitsRequest(method)) << method;
}

TEST(LocalChat, AllowsOnlyContextAndExplicitEditorInsertion)
{
   EXPECT_TRUE(local::permitsRequest("runtime/getConsoleContent"));
   EXPECT_TRUE(local::permitsRequest("workspace/getCurrentScript"));
   EXPECT_TRUE(local::permitsRequest("ui/getCurrentPlot"));
   EXPECT_TRUE(local::permitsRequest("workspace/insertAtCursor"));
   EXPECT_TRUE(local::permitsRequest("workspace/insertIntoNewFile"));
}
