set(LOCAL_ASSISTANT_SOURCE "${CMAKE_CURRENT_LIST_DIR}")
if(WIN32)
   set(LOCAL_ASSISTANT_BUILD_NODE "${RSTUDIO_DEPENDENCIES_DIR}/common/node/${RSTUDIO_NODE_VERSION}/node.exe")
   set(LOCAL_ASSISTANT_NPM_CLI "${RSTUDIO_DEPENDENCIES_DIR}/common/node/${RSTUDIO_NODE_VERSION}/node_modules/npm/bin/npm-cli.js")
else()
   set(LOCAL_ASSISTANT_BUILD_NODE "${RSTUDIO_DEPENDENCIES_DIR}/common/node/${RSTUDIO_NODE_VERSION}/bin/node")
   set(LOCAL_ASSISTANT_NPM_CLI "${RSTUDIO_DEPENDENCIES_DIR}/common/node/${RSTUDIO_NODE_VERSION}/lib/node_modules/npm/bin/npm-cli.js")
endif()
if(NOT EXISTS "${LOCAL_ASSISTANT_BUILD_NODE}" OR NOT EXISTS "${LOCAL_ASSISTANT_NPM_CLI}")
   message(FATAL_ERROR "Install RStudio's pinned Node build dependency before building the local assistant.")
endif()
if(WIN32 AND NOT EXISTS "${LOCAL_ASSISTANT_SOURCE}/llama/llama-server.exe")
   execute_process(COMMAND powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${LOCAL_ASSISTANT_SOURCE}/scripts/install-llama.ps1"
      RESULT_VARIABLE LOCAL_ASSISTANT_LLAMA_RESULT)
   if(NOT LOCAL_ASSISTANT_LLAMA_RESULT EQUAL 0)
      message(FATAL_ERROR "Installing the pinned CPU server failed. Run src/node/local-assistant/scripts/install-llama.ps1 to retry.")
   endif()
endif()
set(LOCAL_ASSISTANT_NPM_STAMP "${LOCAL_ASSISTANT_SOURCE}/node_modules/.rstudio-installed")
add_custom_command(OUTPUT "${LOCAL_ASSISTANT_NPM_STAMP}"
   COMMAND "${LOCAL_ASSISTANT_BUILD_NODE}" "${LOCAL_ASSISTANT_NPM_CLI}" ci --no-fund --no-audit
   COMMAND "${CMAKE_COMMAND}" -E touch "${LOCAL_ASSISTANT_NPM_STAMP}"
   DEPENDS "${LOCAL_ASSISTANT_SOURCE}/package.json" "${LOCAL_ASSISTANT_SOURCE}/package-lock.json"
   WORKING_DIRECTORY "${LOCAL_ASSISTANT_SOURCE}" VERBATIM)
file(GLOB_RECURSE LOCAL_ASSISTANT_SOURCES CONFIGURE_DEPENDS "${LOCAL_ASSISTANT_SOURCE}/src/*")
add_custom_command(OUTPUT "${LOCAL_ASSISTANT_SOURCE}/dist/server/main.js" "${LOCAL_ASSISTANT_SOURCE}/dist/client/main.js"
   COMMAND "${LOCAL_ASSISTANT_BUILD_NODE}" "${LOCAL_ASSISTANT_SOURCE}/build.mjs"
   DEPENDS ${LOCAL_ASSISTANT_SOURCES} "${LOCAL_ASSISTANT_SOURCE}/build.mjs" "${LOCAL_ASSISTANT_NPM_STAMP}"
   WORKING_DIRECTORY "${LOCAL_ASSISTANT_SOURCE}" VERBATIM)
add_custom_target(local-assistant ALL DEPENDS "${LOCAL_ASSISTANT_SOURCE}/dist/server/main.js" "${LOCAL_ASSISTANT_SOURCE}/dist/client/main.js")
install(DIRECTORY "${LOCAL_ASSISTANT_SOURCE}/dist/" DESTINATION "${RSTUDIO_INSTALL_BIN}/local-assistant/dist" PATTERN "test" EXCLUDE)
install(FILES "${LOCAL_ASSISTANT_SOURCE}/system_prompt.txt" "${LOCAL_ASSISTANT_SOURCE}/README.md" "${LOCAL_ASSISTANT_SOURCE}/package.json"
   DESTINATION "${RSTUDIO_INSTALL_BIN}/local-assistant")
install(DIRECTORY "${LOCAL_ASSISTANT_SOURCE}/context" DESTINATION "${RSTUDIO_INSTALL_BIN}/local-assistant")
if(WIN32)
   install(DIRECTORY "${LOCAL_ASSISTANT_SOURCE}/llama" DESTINATION "${RSTUDIO_INSTALL_BIN}/local-assistant")
endif()
