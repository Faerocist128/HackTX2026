package assignment;

import java.io.IOException;
import java.util.Collection;
import java.util.Collections;
import java.util.Locale;
import java.util.Scanner;

public class Boggle {

    public static void main(String[] args) {
        GameManager game = new GameManager();
        GameDictionary dict = new GameDictionary();
        Scanner scanner = new Scanner(System.in);
        int player = 2;
        try {
            game.newGame(4,player, "./prog5/cubes.txt", dict);
            dict.loadDictionary("./prog5/words.txt");
            char[][] testBoard = new char[][]{
                    {'a','a','r','d'},
                    {'w','e','s','v'},
                    {'e','m','o','a'},
                    {'e','l','k','t'},
            };
            game.setGame(testBoard);
        } catch (IOException e) {
            throw new RuntimeException(e);
        }

        // Main game loop
        do {
            boolean gameOver = false;
            int currentPlayer = 0;
            while (!gameOver) {
                gameOver = playerTurn(game, scanner, currentPlayer % player);
                currentPlayer++;
            }
            System.out.println();
            System.out.println("Game over! You missed these words:");
            game.printMissedWords();
            // Machine solve
        } while (startNewGame(game, scanner));

    }

    public static boolean playerTurn(GameManager game, Scanner scanner, int player) {
        // Print Game Board
        boolean turnComplete = false;
        while (!turnComplete) {
            System.out.println("Game Board:");
            game.boardToString();

            // Check for termination
            System.out.println("Enter a word, or type ! to quit: ");
            String word = scanner.nextLine().toLowerCase();
            if (word.equals("!")) {
                return true;
            }

            // Print word and word score
            if (word.length() < 4) {
                System.out.println("Word too short");
            } else if (!isStringAlphabetic(word)) {
                System.out.println("Word invalid, only alphabetic characters allowed");
            } else {
                int score = game.addWord(word, player);
                if (score == 0) {
                    System.out.println("Word does not exist or has already been found");
                } else {
                    game.printWordBoard();
                    System.out.println("You scored: " + score + " points");
                    System.out.println(game.scoresToString());
                    turnComplete = true;
                }
            }
            System.out.println("----------------------------------");
        }


        return false;
    }

    public static boolean startNewGame(GameManager game, Scanner scanner) {
        System.out.println("Start New Game? (yes/no)");
        while (true) {
            String response = scanner.nextLine();
            if (response.equals("no")) {
                return false;
            } else if (response.equals("yes")) {
                game.resetGame();
                return true;
            }
        }
    }

    public static boolean isStringAlphabetic(String str) {
        if (str == null || str.isEmpty()) {
            return false;
        }

        for (int i = 0; i < str.length(); i++) {
            // Using codePointAt handles complex Unicode characters correctly
            if (!Character.isAlphabetic(str.charAt(i))) {
                return false;
            }
        }
        return true;
    }


}
