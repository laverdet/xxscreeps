# CXX=/opt/homebrew/Cellar/llvm/22.1.0/bin/clang++ npm run configure:dev && ninja -C build
set(CMAKE_EXPERIMENTAL_CXX_IMPORT_STD "451f2fe2-a8a2-47c3-bc32-94786d8fc91b")
cmake_minimum_required(VERSION 4.3.0 FATAL_ERROR)
project(pathfinder LANGUAGES CXX)

# language settings
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_CXX_MODULE_STD ON)
set(CMAKE_CXX_STANDARD 26)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# disable legacy isolated-vm warnings
add_compile_options(
	$<$<CXX_COMPILER_ID:Clang>:-Wno-deprecated-declarations>
	$<$<CXX_COMPILER_ID:GNU>:-Wno-deprecated-declarations>
)

# compilation settings
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
if(APPLE)
	set(CMAKE_OSX_DEPLOYMENT_TARGET "13.3")
	set(CMAKE_SHARED_LINKER_FLAGS "-dynamiclib -undefined dynamic_lookup")
elseif(WIN32)
	add_compile_definitions(NOMINMAX NOMSG WIN32_LEAN_AND_MEAN)
endif()

# napi configuration
include(FindNpmPackage)
set(NAPI_VERSION 10)
find_package_from_npm(@auto_js/js)
find_package_from_npm(@auto_js/napi_exports)

# target
add_library(pathfinder SHARED)
set_target_properties(pathfinder PROPERTIES PREFIX "" SUFFIX ".node")
target_link_libraries(pathfinder PUBLIC auto_js nodejs utility_js)

# sources
target_sources(pathfinder
	PUBLIC FILE_SET CXX_MODULES FILES
		src/pf.h.cc
	PRIVATE
		src/main.cc
		src/pf.cc
)

# nan
if(NOT DEFINED NAN_LOCATION)
	execute_process(COMMAND sh -c "node -e 'require(\"nan\")'" OUTPUT_STRIP_TRAILING_WHITESPACE OUTPUT_VARIABLE NAN_LOCATION RESULT_VARIABLE RESULT)
	if(NOT RESULT STREQUAL 0)
		message(FATAL_ERROR "Failed to find 'nan'")
	endif()
	set(NAN_LOCATION "${NAN_LOCATION}" CACHE STRING "")
	message(STATUS "Found 'nan' at ${NAN_LOCATION}")
endif()
target_include_directories(pathfinder PRIVATE "${NAN_LOCATION}")

# isolated-vm
if(NOT DEFINED ISOLATED_VM_LOCATION)
	execute_process(COMMAND sh -c "node -e 'require(\"isolated-vm/include\")'" OUTPUT_STRIP_TRAILING_WHITESPACE OUTPUT_VARIABLE ISOLATED_VM_LOCATION RESULT_VARIABLE RESULT)
	if(NOT RESULT STREQUAL 0)
		message(FATAL_ERROR "Failed to find 'isolated-vm'")
	endif()
	message(STATUS "Found 'isolated-vm' at ${ISOLATED_VM_LOCATION}")
	set(ISOLATED_VM_LOCATION "${ISOLATED_VM_LOCATION}" CACHE STRING "")
endif()
target_include_directories(pathfinder PRIVATE "${ISOLATED_VM_LOCATION}")

# copy to destination
if(NOT DEFINED TRIPLET)
	execute_process(COMMAND sh -c "node -e 'console.log(require(\"./module/triplet.js\"))'" OUTPUT_STRIP_TRAILING_WHITESPACE OUTPUT_VARIABLE TRIPLET RESULT_VARIABLE RESULT)
	if(NOT RESULT STREQUAL 0)
		message(FATAL_ERROR "Failed to get triplet")
	endif()
	set(TRIPLET "${TRIPLET}" CACHE STRING "")
endif()
add_custom_command(
	TARGET pathfinder POST_BUILD COMMAND ${CMAKE_COMMAND} -E copy
	"$<TARGET_FILE:pathfinder>"
	"${CMAKE_SOURCE_DIR}/module/node_modules/@xxscreeps/pathfinder-${TRIPLET}/pf.${TRIPLET}.node")
