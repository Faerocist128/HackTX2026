package assignment;

import java.awt.*;
import java.io.*;
import java.util.*;
import java.util.List;

public class GameManager implements BoggleGame {

    public char[][] board;
    public int size;
    private int numPlayers;
    private int[] scores;
    public String[] cubes;
    public GameDictionary vocab;
    public GameDictionary boardPaths;
    private HashSet<String> playerWords;
    private ArrayList<Point> lastWord;
    private SearchTactic searchTactic = SearchTactic.SEARCH_BOARD;
    // Helper array for grid traversal
    private static final int[][] delta = {{-1,  0,  1, -1, 1, -1, 0, 1},
            {-1, -1, -1,  0, 0,  1, 1, 1}};


    public void newGame(int size, int numPlayers,
                        String cubeFile, BoggleDictionary dict) throws IOException {
        // Initialize instance variables
        this.size = size;
        this.numPlayers = numPlayers;
        this.scores = new int[numPlayers];
        this.playerWords = new HashSet<>();
        this.vocab = (GameDictionary)dict; // should work?
        // Read and Initialize a random size x size board
        this.readCubes(cubeFile);
        this.initBoard();

        // Find all valid words in board
        this.boardPaths = new GameDictionary();
    }

    // Helper method for reading cubes
    private void readCubes(String cubeFile) throws IOException {
        cubes = new String[size * size];
        BufferedReader bufferedReader = new BufferedReader(new FileReader(cubeFile));

        int count = 0;
        String cube = bufferedReader.readLine();
        while (cube != null) {
            // More lines in cube than expected
            if (count >= size * size)
                throw new IOException();

            cubes[count] = cube.toLowerCase();
            cube = bufferedReader.readLine();
            count++;
        }

        // Fewer lines in cube than expected
        if (cubes[size * size - 1] == null)
            throw new IOException();
    }

    // HELPER for randomly initializing the board
    public void initBoard() {
        this.board = new char[size][size];
        int matrixSize = size * size;
        Random rand = new Random();

        // Randomly swaps cube position and picks random character
        for (int i = 0; i < matrixSize; i++) {
            // Picks random swap index
            int randIdx = i + rand.nextInt(matrixSize - i);
            // Swap
            String cube = cubes[i];
            cubes[i] = cubes[randIdx];
            cubes[randIdx] = cube;
            // Sets board[y][x] to random character within cube
            int x = i % size;
            int y = i / size;
            board[y][x] = cubes[i].charAt(rand.nextInt(size));
        }
    }


    public char[][] getBoard() {
        return this.board;
    }



    private boolean isValid(int x, int y, boolean[][] visited) {
        return x >= 0 && x < size && y >= 0 && y < size && !visited[y][x];
    }

    private boolean findWord(Point currentPosition, String word, int index,
                          boolean[][] visited, List<Point> path) {
        // Check validity
        if (word.charAt(index) != board[currentPosition.y][currentPosition.x])
            return false;
        // Add to path & visited
        path.add(currentPosition);
        visited[currentPosition.y][currentPosition.x] = true;
        // Check path complete
        if (index == word.length() - 1)
            return true;

        // Check all neighbors
        for (int i = 0; i < delta[0].length; i++) {
            int dx = currentPosition.x + delta[0][i];
            int dy = currentPosition.y + delta[1][i];
            // Check bounds and recurse
            if (isValid(dx, dy, visited) && findWord(new Point(dx, dy), word, index + 1, visited, path))
                return true;
        }

        // Backtrack
        path.remove(path.size() - 1);
        visited[currentPosition.y][currentPosition.x] = false;
        // Word not found
        return false;
    }

    private void findWords(int x, int y, boolean[][] visited, String prefix,
                           Collection<String> allWords) {
        prefix += board[y][x];
        visited[y][x] = true;
        // Check validity
        if (vocab.isPrefix(prefix)) {
            if (prefix.length() >= 4 && vocab.contains(prefix))
                allWords.add(prefix);

            for (int i = 0; i < delta[0].length; i++) {
                int dx = x + delta[0][i];
                int dy = y + delta[1][i];
                // Check bounds and recurse
                if (isValid(dx, dy, visited))
                    findWords(dx, dy, visited, prefix, allWords);
            }
        }

        visited[y][x] = false;
        prefix = prefix.substring(0, prefix.length() - 1);
    }

    public int addWord(String word, int player) {
        // Ensure lowercase
        word = word.toLowerCase();
        // Check for existence/validity
        if (word.length() < 4 || playerWords.contains(word) || !vocab.contains(word))
            return 0;

        boolean[][] visited = new boolean[size][size];
        ArrayList<Point> path = new ArrayList<>();
        // Try every starting character
        for (int i = 0; i < size; i++) {
            for (int j = 0; j < size; j++) {
                if (findWord(new Point(i, j), word, 0, visited, path)) {
                    lastWord = path;
                    scores[player] += word.length() - 3;
                    playerWords.add(word);
                    return (word.length() - 3);
                }
            }
        }
        // Word not found
        return 0;
    }

    public List<Point> getLastAddedWord() {
        return this.lastWord;
    }

    public void setGame(char[][] board) {
        this.board = board;
    }

    public Collection<String> getAllWords() {
        Collection<String> allWords = new HashSet<>();
        if (this.searchTactic == SearchTactic.SEARCH_BOARD) {
            searchBoard(allWords);
        }
        else if (this.searchTactic == SearchTactic.SEARCH_DICT) {
            return this.searchDict();
        }
        return allWords;
    }

    public void searchBoard(Collection<String> allWords) {
        boolean[][] visited = new boolean[size][size];
        for (int i = 0; i < size; i++) {
            for (int j = 0; j < size; j++) {
                findWords(i, j, visited, "", allWords);
            }
        }
    }

    public ArrayList<String> searchDict() {

        return null;
    }

    public void setSearchTactic(SearchTactic tactic) {
        this.searchTactic = tactic;
    }

    public int[] getScores() {
        return this.scores;
    }

    public void resetGame() {
        initBoard();
        scores = new int[numPlayers];
        playerWords = new HashSet<>();
    }

    public void boardToString() {
        for (char[] row : board) System.out.println(Arrays.toString(row));
    }

    public String scoresToString() {
        String score = "Scores: ";
        for (int i = 0; i < scores.length; i++) {
            score += "Player " + (i + 1) + ": " + scores[i] + " ";
        }
        return score;
    }

    public void printWordBoard() {
        if (this.getLastAddedWord() == null) {
            return;
        };
        for (Point p : this.getLastAddedWord()) {
            System.out.println(p.x + " " + p.y);
            board[p.y][p.x] = Character.toUpperCase(board[p.y][p.x]);
        }
        boardToString();
        for (Point p : this.getLastAddedWord()) {
            board[p.y][p.x] = Character.toLowerCase(board[p.y][p.x]);
        }
    }

    public void printMissedWords() {
//        System.out.println(allWords.size());
        Collection<String> set = getAllWords();
        set.removeAll(playerWords);
        ArrayList<String> wordList = new ArrayList<>(set);
        wordList.sort(Comparator.comparingInt(String::length).reversed());
        for (String word : wordList) {
            System.out.println(word + " " + (word.length() - 3));
        }
    }
}
